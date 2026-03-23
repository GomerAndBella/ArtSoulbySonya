const RETURNING_KEY = "gallery_visit_count";
const THANK_YOU_MESSAGE = "Your reflection has been gently received. Thank you for sharing a moment within the gallery.";

const returningMessages = [
  "Welcome back. The desert remembers your footsteps.",
  "You've returned. Take your time - something new may speak today.",
  "The gallery is glad to see you again."
];

const blessings = [
  "Carry wonder with you until we meet again.",
  "May wonder walk beside you on your way.",
  "Take a little wonder with you as you go.",
  "Until next time - may curiosity and light guide your path."
];

let allArtworks = [];
let supabaseClient = null;

function absoluteUrl(pathname = "/") {
  const cfg = window.GALLERY_CONFIG || {};
  const siteUrl = String(cfg.siteUrl || "").trim().replace(/\/$/, "");
  if (siteUrl) return `${siteUrl}${pathname}`;
  return `${window.location.origin}${pathname}`;
}

function setMeta(selector, value, attr = "content") {
  if (!value) return;
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

function setupHomeMetadata() {
  const cfg = window.GALLERY_CONFIG || {};
  const siteName = cfg.siteName || "Art & Soul - A Desert Gallery";
  const description = "A desert gallery by Sonya featuring sacred, story-led artwork, collector inquiry, and direct purchase for selected pieces.";
  const canonical = absoluteUrl("/");
  const image = String(cfg.defaultOgImage || "").trim();

  document.title = siteName;
  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', siteName);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[property="og:url"]', canonical);
  setMeta('meta[property="og:image"]', image);
  setMeta('meta[name="twitter:title"]', siteName);
  setMeta('meta[name="twitter:description"]', description);
  setMeta('meta[name="twitter:image"]', image);
  setMeta('link[rel="canonical"]', canonical, "href");
}

function rotateFrom(list, seed = Date.now()) {
  const idx = Math.abs(seed) % list.length;
  return list[idx];
}

function setupReturningMessage() {
  const el = document.getElementById("returning-message");
  if (!el) return;
  const count = Number(localStorage.getItem(RETURNING_KEY) || "0");
  if (count > 0) el.textContent = rotateFrom(returningMessages, count);
  localStorage.setItem(RETURNING_KEY, String(count + 1));
}

function setupBlessing() {
  const el = document.getElementById("blessing");
  if (!el) return;
  const daySeed = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  el.textContent = rotateFrom(blessings, daySeed);
}

function roundUpToTen(value) {
  return Math.ceil(value / 10) * 10;
}

function midRoundedPrice(artwork) {
  const floor = Number(artwork.floor_price || 0);
  const stretch = Number(artwork.stretch_price || 0);
  if (floor > 0 && stretch > 0) return roundUpToTen((floor + stretch) / 2);

  const target = Number(artwork.target_price || 0);
  if (target > 0) return roundUpToTen(target);

  const active = Number(artwork.active_price || 0);
  if (active > 0) return roundUpToTen(active);

  return null;
}

function optimizedImageUrl(url) {
  if (!url) return "";
  if (!url.includes("/storage/v1/object/public/")) return url;
  const transformed = url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}width=900&height=700&resize=contain&quality=70&format=origin`;
}

function getCheckoutLink(artwork, cfg) {
  const pieceLink = String(artwork.stripe_payment_link || "").trim();
  if (pieceLink) return pieceLink;

  const defaultLink = String(cfg.stripeDefaultPaymentLink || "").trim();
  if (defaultLink) return defaultLink;

  return "";
}

function createImageFallback(title) {
  const safeTitle = title || "Artwork image coming soon";
  return `<div class="artwork-image-fallback" role="img" aria-label="${safeTitle}">${safeTitle}<br />Image coming soon</div>`;
}

function attachImageFallbacks(root = document) {
  const images = root.querySelectorAll("img.artwork-image");
  images.forEach((img) => {
    img.addEventListener("error", () => {
      const label = img.getAttribute("alt") || "Artwork image coming soon";
      const fallback = document.createElement("div");
      fallback.className = "artwork-image-fallback";
      fallback.setAttribute("role", "img");
      fallback.setAttribute("aria-label", label);
      fallback.innerHTML = `${label}<br />Image coming soon`;
      img.replaceWith(fallback);
    }, { once: true });
  });
}

async function logCheckoutStart(client, checkoutMeta) {
  if (!client) return;
  const payload = {
    artwork_id: checkoutMeta.artworkId || null,
    piece_code: checkoutMeta.pieceCode || null,
    title_snapshot: checkoutMeta.title || null,
    estimated_amount: checkoutMeta.estimatedAmount || null,
    checkout_url: checkoutMeta.checkoutUrl || null,
    source_page: checkoutMeta.sourcePage || "gallery"
  };
  await client.from("orders").insert(payload);
}

function makeCard(artwork) {
  const cfg = window.GALLERY_CONFIG || {};
  const card = document.createElement("article");
  card.className = "card artwork";

  const collection = artwork.collection_name || "Collection";
  const price = midRoundedPrice(artwork);
  const priceText = price ? `$${price.toFixed(0)}` : "Price on request";
  const status = artwork.status || "available";
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const checkoutLink = getCheckoutLink(artwork, cfg);
  const checkoutCta = status === "reserved" ? "Join waitlist inquiry" : "Reserve / Buy";
  const imageUrl = optimizedImageUrl(artwork.hero_image_url);
  const imageAlt = artwork.hero_image_alt || artwork.title;
  const imageHtml = imageUrl
    ? `<img class="artwork-image" src="${imageUrl}" alt="${imageAlt}" loading="lazy" />`
    : createImageFallback(artwork.title);
  const checkoutHtml = checkoutLink
    ? `<a class="btn checkout-btn" href="${checkoutLink}" data-artwork-id="${artwork.id}" data-piece-code="${artwork.piece_code || ""}" data-piece-title="${artwork.title}" data-estimated-amount="${price || ""}" data-source-page="gallery">${checkoutCta}</a>`
    : "";
  const policyHtml = checkoutLink
    ? `<a class="policy-link" href="checkout-policy.html">Checkout policy</a>`
    : "";

  card.innerHTML = `
    ${imageHtml}
    <div class="artwork-summary">
      <h3>${artwork.title}</h3>
      <p class="room">${collection}</p>
      <p class="status status-${status}">${statusLabel}</p>
      <p class="whisper">${artwork.short_description || ""}</p>
      <p class="price-line"><strong>Gallery Price:</strong> ${priceText}</p>
      <div class="actions">
        <a class="btn alt" href="artwork.html?slug=${encodeURIComponent(artwork.slug)}">View details</a>
        ${checkoutHtml}
      </div>
      ${policyHtml}
    </div>
    <form class="ask-form" data-artwork-id="${artwork.id}" data-piece="${artwork.title}">
      <h4>Ask the Artist</h4>
      <p>You are welcome to leave a question or share what this piece stirred in you.</p>
      <label>Name <input name="name" required /></label>
      <label>Email <input type="email" name="email" required /></label>
      <label>Message <textarea name="message" rows="4" required></textarea></label>
      <button class="btn" type="submit">Send to the Artist</button>
      <p class="success" aria-live="polite"></p>
    </form>
  `;

  return card;
}

async function setupAskForms(client) {
  const forms = document.querySelectorAll(".ask-form");
  forms.forEach((form) => {
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
  });
}

async function setupCheckoutButtons(client) {
  const checkoutButtons = document.querySelectorAll(".checkout-btn");
  checkoutButtons.forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      const checkoutUrl = btn.getAttribute("href") || "";
      const artworkId = btn.getAttribute("data-artwork-id") || null;
      const pieceCode = btn.getAttribute("data-piece-code") || null;
      const title = btn.getAttribute("data-piece-title") || null;
      const estimatedRaw = btn.getAttribute("data-estimated-amount") || "";
      const estimatedAmount = estimatedRaw ? Number(estimatedRaw) : null;
      const sourcePage = btn.getAttribute("data-source-page") || "gallery";

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
  });
}

function renderArtworkGrid(rows) {
  const grid = document.getElementById("artworks-grid");
  grid.innerHTML = "";
  if (!rows.length) {
    grid.innerHTML = `<div class="card empty-state"><h3>No artworks are visible right now.</h3><p>Check back soon for the next collection update.</p></div>`;
    return;
  }
  rows.forEach((artwork) => grid.appendChild(makeCard(artwork)));
  attachImageFallbacks(grid);
}

function setupCollectionFilter() {
  const filter = document.getElementById("collection-filter");
  if (!filter) return;

  const collections = [...new Set(allArtworks.map((a) => a.collection_name).filter(Boolean))].sort();
  collections.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    filter.appendChild(opt);
  });

  filter.addEventListener("change", async () => {
    const selected = filter.value;
    const filtered = selected === "all"
      ? allArtworks
      : allArtworks.filter((a) => a.collection_name === selected);

    renderArtworkGrid(filtered);
    await setupCheckoutButtons(supabaseClient);
    await setupAskForms(supabaseClient);
  });
}

async function loadArtworks() {
  const cfg = window.GALLERY_CONFIG || {};
  const loading = document.getElementById("loading-artworks");

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
    if (loading) loading.textContent = "Supabase connection is not configured yet.";
    return;
  }

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  supabaseClient = client;

  const { data, error } = await client
    .from("artworks")
    .select("id,piece_code,title,slug,short_description,active_price,floor_price,target_price,stretch_price,status,hero_image_url,hero_image_alt,stripe_payment_link,collection_id,collections(name)")
    .in("status", ["available", "reserved"])
    .order("piece_code", { ascending: true });

  if (error) {
    if (loading) loading.textContent = `Could not load artworks: ${error.message}`;
    return;
  }

  if (loading) loading.remove();

  allArtworks = (data || []).map((row) => ({
    ...row,
    collection_name: row.collections?.name || "Collection"
  }));

  renderArtworkGrid(allArtworks);
  setupCollectionFilter();

  await setupCheckoutButtons(client);
  await setupAskForms(client);
}

setupHomeMetadata();
setupReturningMessage();
setupBlessing();
loadArtworks();
