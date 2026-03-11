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
  const imageHtml = imageUrl
    ? `<img class="artwork-image" src="${imageUrl}" alt="${artwork.title}" loading="lazy" />`
    : "";
  const checkoutHtml = checkoutLink
    ? `<a class="btn" href="${checkoutLink}" target="_blank" rel="noopener noreferrer">${checkoutCta}</a>`
    : "";
  const policyHtml = checkoutLink
    ? `<a class="policy-link" href="checkout-policy.html">Checkout policy</a>`
    : "";

  card.innerHTML = `
    ${imageHtml}
    <h3>${artwork.title}</h3>
    <p class="room">${collection}</p>
    <p class="status status-${status}">${statusLabel}</p>
    <p class="whisper">${artwork.short_description || ""}</p>
    <p><strong>Gallery Price:</strong> ${priceText}</p>
    <div class="actions">
      <a class="btn alt" href="artwork.html?slug=${encodeURIComponent(artwork.slug)}">View details</a>
      ${checkoutHtml}
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

function renderArtworkGrid(rows) {
  const grid = document.getElementById("artworks-grid");
  grid.innerHTML = "";
  rows.forEach((artwork) => grid.appendChild(makeCard(artwork)));
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
    .select("id,title,slug,short_description,active_price,floor_price,target_price,stretch_price,status,hero_image_url,stripe_payment_link,collection_id,collections(name)")
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

  await setupAskForms(client);
}

setupReturningMessage();
setupBlessing();
loadArtworks();
