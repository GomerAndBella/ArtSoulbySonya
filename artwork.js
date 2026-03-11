const THANK_YOU_MESSAGE = "Your reflection has been gently received. Thank you for sharing a moment within the gallery.";

function getSlug() {
  const params = new URLSearchParams(window.location.search);
  return params.get("slug");
}

function price(v) {
  const n = Number(v || 0);
  return n > 0 ? `$${n.toFixed(0)}` : "Price on request";
}

function roundUpToTen(value) {
  return Math.ceil(value / 10) * 10;
}

function midRoundedPrice(a) {
  const floor = Number(a.floor_price || 0);
  const stretch = Number(a.stretch_price || 0);
  if (floor > 0 && stretch > 0) return roundUpToTen((floor + stretch) / 2);

  const target = Number(a.target_price || 0);
  if (target > 0) return roundUpToTen(target);

  const active = Number(a.active_price || 0);
  if (active > 0) return roundUpToTen(active);

  return null;
}

function optimizedImageUrl(url) {
  if (!url) return "";
  if (!url.includes("/storage/v1/object/public/")) return url;
  const transformed = url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}width=1400&height=1200&resize=contain&quality=75&format=origin`;
}

function getCheckoutLink(artwork, cfg) {
  const pieceLink = String(artwork.stripe_payment_link || "").trim();
  if (pieceLink) return pieceLink;

  const defaultLink = String(cfg.stripeDefaultPaymentLink || "").trim();
  if (defaultLink) return defaultLink;

  return "";
}

async function logCheckoutStart(client, checkoutMeta) {
  if (!client) return;
  const payload = {
    artwork_id: checkoutMeta.artworkId || null,
    piece_code: checkoutMeta.pieceCode || null,
    title_snapshot: checkoutMeta.title || null,
    estimated_amount: checkoutMeta.estimatedAmount || null,
    checkout_url: checkoutMeta.checkoutUrl || null,
    source_page: checkoutMeta.sourcePage || "detail"
  };
  await client.from("orders").insert(payload);
}

function renderArtwork(el, a, collectionName) {
  const cfg = window.GALLERY_CONFIG || {};
  const galleryPrice = midRoundedPrice(a);
  const galleryPriceText = galleryPrice ? `$${galleryPrice.toFixed(0)}` : "Price on request";
  const status = a.status || "available";
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const imageUrl = optimizedImageUrl(a.hero_image_url);
  const checkoutLink = getCheckoutLink(a, cfg);
  const checkoutCta = status === "reserved" ? "Join waitlist inquiry" : "Reserve / Buy";
  const imageHtml = imageUrl
    ? `<img class="artwork-image" src="${imageUrl}" alt="${a.title}" loading="lazy" />`
    : "";
  const checkoutHtml = checkoutLink
    ? `<div class="actions"><a class="btn checkout-btn" href="${checkoutLink}" data-artwork-id="${a.id}" data-piece-code="${a.piece_code || ""}" data-piece-title="${a.title}" data-estimated-amount="${galleryPrice || ""}" data-source-page="detail">${checkoutCta}</a><a class="policy-link" href="checkout-policy.html">Checkout policy</a></div>`
    : "";
  el.innerHTML = `
    ${imageHtml}
    <h1>${a.title}</h1>
    <p class="room">${collectionName}</p>
    <p class="status status-${status}">${statusLabel}</p>
    <p class="whisper">${a.short_description || ""}</p>
    <p><strong>Gallery Price:</strong> ${galleryPriceText}</p>
    <p><strong>Price Band:</strong> Floor ${price(a.floor_price)} | Target ${price(a.target_price)} | Stretch ${price(a.stretch_price)}</p>
    <p><strong>Year:</strong> ${a.year_completed || "TBD"}</p>
    <p><strong>Materials:</strong> ${a.materials || "TBD"}</p>
    <p><strong>Story:</strong> ${a.story || "Story coming soon."}</p>
    ${checkoutHtml}
    <form class="ask-form" id="detail-ask-form" data-artwork-id="${a.id}" data-piece="${a.title}">
      <h4>Ask the Artist</h4>
      <label>Name <input name="name" required /></label>
      <label>Email <input type="email" name="email" required /></label>
      <label>Message <textarea name="message" rows="4" required></textarea></label>
      <button class="btn" type="submit">Send to the Artist</button>
      <p class="success" aria-live="polite"></p>
    </form>
  `;
}

async function setupCheckoutButton(client) {
  const btn = document.querySelector(".checkout-btn");
  if (!btn) return;

  btn.addEventListener("click", async (event) => {
    event.preventDefault();
    const checkoutUrl = btn.getAttribute("href") || "";
    const artworkId = btn.getAttribute("data-artwork-id") || null;
    const pieceCode = btn.getAttribute("data-piece-code") || null;
    const title = btn.getAttribute("data-piece-title") || null;
    const estimatedRaw = btn.getAttribute("data-estimated-amount") || "";
    const estimatedAmount = estimatedRaw ? Number(estimatedRaw) : null;
    const sourcePage = btn.getAttribute("data-source-page") || "detail";

    try {
      await logCheckoutStart(client, {
        artworkId,
        pieceCode,
        title,
        estimatedAmount,
        checkoutUrl,
        sourcePage
      });
    } catch (error) {
      console.warn("Checkout log insert failed", error);
    }

    window.open(checkoutUrl, "_blank", "noopener,noreferrer");
  });
}

async function setupForm(client) {
  const form = document.getElementById("detail-ask-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const payload = {
      artwork_id: form.getAttribute("data-artwork-id") || null,
      full_name: String(data.get("name") || ""),
      email: String(data.get("email") || ""),
      message: String(data.get("message") || ""),
      source: "website",
      status: "new"
    };

    const successEl = form.querySelector(".success");
    const { error } = await client.from("inquiries").insert(payload);

    if (error) {
      if (successEl) successEl.textContent = "Message could not be sent yet. Please try again.";
      return;
    }

    if (successEl) successEl.textContent = THANK_YOU_MESSAGE;
    form.reset();
  });
}

async function init() {
  const cfg = window.GALLERY_CONFIG || {};
  const el = document.getElementById("artwork-detail");
  const slug = getSlug();

  if (!slug) {
    el.innerHTML = "<p>Missing artwork slug.</p>";
    return;
  }

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
    el.innerHTML = "<p>Supabase connection is not configured yet.</p>";
    return;
  }

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  const { data, error } = await client
    .from("artworks")
    .select("*,collections(name)")
    .eq("slug", slug)
    .in("status", ["available", "reserved"])
    .single();

  if (error || !data) {
    el.innerHTML = `<p>Could not load artwork details.</p>`;
    return;
  }

  renderArtwork(el, data, data.collections?.name || "Collection");
  await setupCheckoutButton(client);
  await setupForm(client);
}

init();
