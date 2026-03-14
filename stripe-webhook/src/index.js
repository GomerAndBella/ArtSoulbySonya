function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function prefixOf(value) {
  if (!value) return null;
  const idx = value.indexOf("_");
  if (idx === -1) return value.slice(0, 4);
  return value.slice(0, idx + 1);
}

function secureCompare(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacSha256Hex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const bytes = new Uint8Array(sig);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyStripeSignature(stripeSigHeader, body, secret, toleranceSec = 300) {
  if (!stripeSigHeader || !secret) return false;

  const parts = Object.fromEntries(
    stripeSigHeader.split(",").map((p) => {
      const idx = p.indexOf("=");
      return [p.slice(0, idx), p.slice(idx + 1)];
    })
  );

  const timestamp = Number(parts.t || 0);
  const signature = parts.v1 || "";
  if (!timestamp || !signature) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSec) return false;

  const signedPayload = `${timestamp}.${body}`;
  const expected = await hmacSha256Hex(secret, signedPayload);
  return secureCompare(expected, signature);
}

async function stripeRequest(path, stripeSecretKey, method = "GET") {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe API ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function supabaseSelectOne({ supabaseUrl, supabaseServiceRoleKey, query }) {
  const url = `${supabaseUrl}/rest/v1/orders?${query}`;
  const res = await fetch(url, {
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      Accept: "application/json"
    }
  });
  if (!res.ok) throw new Error(`Supabase select failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows?.[0] || null;
}

async function supabasePatch({ supabaseUrl, supabaseServiceRoleKey, table, where, payload }) {
  const url = `${supabaseUrl}/rest/v1/${table}?${where}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Supabase patch ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function centsToDollars(amount) {
  if (typeof amount !== "number") return null;
  return Number((amount / 100).toFixed(2));
}

async function processCheckoutCompleted(event, env) {
  const session = event?.data?.object;
  if (!session) return { ok: true, skipped: "missing session object" };

  let paymentLinkUrl = null;
  const paymentLinkId = session.payment_link || null;
  if (paymentLinkId) {
    const paymentLink = await stripeRequest(`/v1/payment_links/${paymentLinkId}`, env.STRIPE_SECRET_KEY);
    paymentLinkUrl = paymentLink.url || null;
  }

  if (!paymentLinkUrl) {
    return { ok: true, skipped: "session has no payment link url to map order" };
  }

  const query = [
    `select=id,artwork_id,piece_code,status,checkout_url`,
    `checkout_url=eq.${encodeURIComponent(paymentLinkUrl)}`,
    `status=eq.checkout_started`,
    `order=created_at.desc`,
    `limit=1`
  ].join("&");

  const order = await supabaseSelectOne({
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    query
  });

  if (!order) {
    return {
      ok: true,
      skipped: "no matching checkout_started order",
      paymentLinkUrl
    };
  }

  const buyerEmail = session.customer_details?.email || session.customer_email || null;
  const paidAmount = centsToDollars(session.amount_total);
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;

  await supabasePatch({
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    table: "orders",
    where: `id=eq.${order.id}`,
    payload: {
      status: "paid",
      buyer_email: buyerEmail,
      paid_amount: paidAmount,
      stripe_session_id: session.id || null,
      stripe_payment_intent_id: paymentIntentId
    }
  });

  if (order.artwork_id) {
    await supabasePatch({
      supabaseUrl: env.SUPABASE_URL,
      supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      table: "artworks",
      where: `id=eq.${order.artwork_id}`,
      payload: { status: "reserved" }
    });
  }

  return {
    ok: true,
    updatedOrderId: order.id,
    updatedArtworkId: order.artwork_id || null,
    paymentLinkUrl
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        secrets: {
          stripeSecretKeyPrefix: prefixOf(env.STRIPE_SECRET_KEY),
          stripeWebhookSigningSecretPrefix: prefixOf(env.STRIPE_WEBHOOK_SIGNING_SECRET),
          supabaseUrlConfigured: Boolean(env.SUPABASE_URL),
          supabaseServiceRoleConfigured: Boolean(env.SUPABASE_SERVICE_ROLE_KEY)
        }
      });
    }

    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    if (!env.STRIPE_WEBHOOK_SIGNING_SECRET || !env.STRIPE_SECRET_KEY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Missing required environment secrets" }, 500);
    }

    if (!String(env.STRIPE_SECRET_KEY).startsWith("sk_")) {
      return json({ error: "Invalid STRIPE_SECRET_KEY prefix", prefix: prefixOf(env.STRIPE_SECRET_KEY) }, 500);
    }

    if (!String(env.STRIPE_WEBHOOK_SIGNING_SECRET).startsWith("whsec_")) {
      return json({ error: "Invalid STRIPE_WEBHOOK_SIGNING_SECRET prefix", prefix: prefixOf(env.STRIPE_WEBHOOK_SIGNING_SECRET) }, 500);
    }

    const signature = request.headers.get("stripe-signature");
    const body = await request.text();
    const isValid = await verifyStripeSignature(signature, body, env.STRIPE_WEBHOOK_SIGNING_SECRET);
    if (!isValid) return json({ error: "Invalid Stripe signature" }, 400);

    let event;
    try {
      event = JSON.parse(body);
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    try {
      if (event.type === "checkout.session.completed") {
        const result = await processCheckoutCompleted(event, env);
        return json({ received: true, type: event.type, result });
      }
      return json({ received: true, ignoredType: event.type });
    } catch (error) {
      return json({ error: "Webhook processing failed", message: String(error.message || error) }, 500);
    }
  }
};
