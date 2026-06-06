const THANK_YOU_MESSAGE = "Your reflection has been gently received. Thank you for sharing a moment within the gallery.";
let imageLightbox = null;

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

function displayPrice(a) {
  const floor = Number(a.floor_price || 0);
  const target = Number(a.target_price || 0);
  if (floor > 0 && target > 0) return roundUpToTen((floor + target) / 2);

  if (floor > 0) return roundUpToTen(floor);

  if (target > 0) return roundUpToTen(target);

  const active = Number(a.active_price || 0);
  if (active > 0) return roundUpToTen(active);

  return null;
}

function optimizedImageUrl(url) {
  if (!url) return "";
  // Supabase transform URLs can return 403 after project suspension/recovery.
  // Use the original public object URL so artwork images still render.
  return url;
}

function optimizedThumbUrl(url) {
  if (!url) return "";
  return url;
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

function ensureImageLightbox() {
  if (imageLightbox) return imageLightbox;

  const overlay = document.createElement("div");
  overlay.className = "image-lightbox";
  overlay.hidden = true;
  overlay.innerHTML = `
    <button class="image-lightbox-nav image-lightbox-prev" type="button" aria-label="Previous image">Prev</button>
    <button class="image-lightbox-nav image-lightbox-next" type="button" aria-label="Next image">Next</button>
    <button class="image-lightbox-close" type="button" aria-label="Close image zoom">Close</button>
    <figure class="image-lightbox-figure">
      <img class="image-lightbox-img" src="" alt="" />
      <figcaption class="image-lightbox-caption"></figcaption>
    </figure>
  `;

  const prevBtn = overlay.querySelector(".image-lightbox-prev");
  const nextBtn = overlay.querySelector(".image-lightbox-next");
  const closeBtn = overlay.querySelector(".image-lightbox-close");
  const lightboxImg = overlay.querySelector(".image-lightbox-img");
  const caption = overlay.querySelector(".image-lightbox-caption");
  const state = { items: [], index: 0 };

  function renderLightboxItem() {
    const current = state.items[state.index];
    if (!current) return;
    lightboxImg.src = current.src;
    lightboxImg.alt = current.alt || "Expanded artwork image";
    caption.textContent = current.alt || "";
    const multi = state.items.length > 1;
    prevBtn.hidden = !multi;
    nextBtn.hidden = !multi;
  }

  function closeLightbox() {
    overlay.hidden = true;
    overlay.classList.remove("is-open");
    lightboxImg.src = "";
    caption.textContent = "";
    document.body.classList.remove("lightbox-open");
  }

  function moveLightbox(step) {
    if (state.items.length < 2) return;
    state.index = (state.index + step + state.items.length) % state.items.length;
    renderLightboxItem();
  }

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeLightbox();
  });
  prevBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    moveLightbox(-1);
  });
  nextBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    moveLightbox(1);
  });
  closeBtn.addEventListener("click", closeLightbox);
  document.addEventListener("keydown", (event) => {
    if (!overlay.classList.contains("is-open")) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") moveLightbox(-1);
    if (event.key === "ArrowRight") moveLightbox(1);
  });

  document.body.appendChild(overlay);
  imageLightbox = { overlay, state, renderLightboxItem };
  return imageLightbox;
}

function openImageLightbox(items, startIndex = 0) {
  if (!items.length) return;
  const lightbox = ensureImageLightbox();
  lightbox.state.items = items;
  lightbox.state.index = startIndex;
  lightbox.renderLightboxItem();
  lightbox.overlay.hidden = false;
  lightbox.overlay.classList.add("is-open");
  document.body.classList.add("lightbox-open");
}

function attachZoomHandlers(root = document) {
  const images = root.querySelectorAll("img.artwork-image, .thumb-btn img");
  const mainImage = root.querySelector(".artwork-image-main");
  const thumbButtons = [...root.querySelectorAll(".thumb-btn")];
  const zoomItems = [];

  if (mainImage) {
    zoomItems.push({
      src: mainImage.currentSrc || mainImage.src,
      alt: mainImage.alt
    });
  }

  thumbButtons.forEach((btn, index) => {
    const fullImage = btn.getAttribute("data-full-image") || "";
    if (!fullImage) return;
    if (!zoomItems.some((item) => item.src === fullImage)) {
      zoomItems.push({
        src: fullImage,
        alt: mainImage?.alt || `Artwork image ${index + 1}`
      });
    }
  });

  images.forEach((img) => {
    img.classList.add("zoomable-image");
    if (img.dataset.zoomBound === "true") return;
    img.dataset.zoomBound = "true";
    img.addEventListener("click", (event) => {
      event.stopPropagation();
      const thumbBtn = img.closest(".thumb-btn");
      const targetSrc = thumbBtn?.getAttribute("data-full-image") || img.currentSrc || img.src;
      const itemIndex = Math.max(0, zoomItems.findIndex((item) => item.src === targetSrc));
      openImageLightbox(zoomItems.length ? zoomItems : [{ src: targetSrc, alt: img.alt }], itemIndex);
    });
  });
}

function getArtworkImages(artwork) {
  const manifest = window.ARTWORK_IMAGE_MANIFEST || {};
  const listed = Array.isArray(manifest[artwork.piece_code]) ? manifest[artwork.piece_code] : [];
  const primary = artwork.hero_image_url ? [artwork.hero_image_url] : [];
  return [...new Set([...primary, ...listed])];
}

function makeArtworkGallery(a, imageAlt) {
  const urls = getArtworkImages(a);
  const primaryUrl = optimizedImageUrl(urls[0] || "");

  if (!primaryUrl) return createImageFallback(a.title);

  const thumbs = urls.length > 1
    ? `<div class="artwork-thumbs" role="list" aria-label="Artwork views">
        ${urls.map((url, index) => `
          <button class="thumb-btn${index === 0 ? " is-active" : ""}" type="button" data-full-image="${optimizedImageUrl(url)}" data-thumb-index="${index}" aria-label="View ${a.title} image ${index + 1}">
            <img src="${optimizedThumbUrl(url)}" alt="" loading="lazy" />
          </button>
        `).join("")}
      </div>`
    : "";

  return `
    <div class="artwork-gallery">
      <img class="artwork-image artwork-image-main" src="${primaryUrl}" alt="${imageAlt}" loading="eager" />
      ${thumbs}
      <p class="zoom-hint">Click image to enlarge. Use arrows in zoom view for more images.</p>
    </div>
  `;
}

function setupArtworkMetadata(artwork, collectionName) {
  const cfg = window.GALLERY_CONFIG || {};
  const siteName = cfg.siteName || "Art & Soul - A Desert Gallery";
  const title = `${artwork.title} | ${siteName}`;
  const description = artwork.short_description
    || artwork.story
    || `View ${artwork.title} from ${collectionName} at ${siteName}.`;
  const canonical = absoluteUrl(`/artwork.html?slug=${encodeURIComponent(artwork.slug)}`);
  const image = optimizedImageUrl(artwork.hero_image_url) || String(cfg.defaultOgImage || "").trim();

  document.title = title;
  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[property="og:url"]', canonical);
  setMeta('meta[property="og:image"]', image);
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[name="twitter:description"]', description);
  setMeta('meta[name="twitter:image"]', image);
  setMeta('link[rel="canonical"]', canonical, "href");
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
  const galleryPrice = displayPrice(a);
  const galleryPriceText = galleryPrice ? `$${galleryPrice.toFixed(0)}` : "Price on request";
  const status = a.status || "available";
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const imageAlt = a.hero_image_alt || a.title;
  const checkoutLink = getCheckoutLink(a, cfg);
  const checkoutCta = status === "reserved" ? "Join waitlist inquiry" : "Reserve / Buy";
  const imageHtml = makeArtworkGallery(a, imageAlt);
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

function attachImageFallback(el) {
  const images = el.querySelectorAll("img.artwork-image, .thumb-btn img");
  images.forEach((img) => {
    img.addEventListener("error", () => {
      const isMain = img.classList.contains("artwork-image");
      if (!isMain) {
        const thumb = img.closest(".thumb-btn");
        if (thumb) thumb.remove();
        return;
      }

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

function setupArtworkThumbs(el) {
  const mainImage = el.querySelector(".artwork-image-main");
  const thumbs = el.querySelectorAll(".thumb-btn");
  if (!mainImage || !thumbs.length) return;

  thumbs.forEach((thumb) => {
    thumb.addEventListener("click", () => {
      const nextUrl = thumb.getAttribute("data-full-image") || "";
      if (!nextUrl) return;
      mainImage.src = nextUrl;
      thumbs.forEach((btn) => btn.classList.remove("is-active"));
      thumb.classList.add("is-active");
    });
  });
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
    el.innerHTML = `<div class="empty-state"><h2>Artwork not available</h2><p>This piece may have moved, sold, or been archived.</p><p><a class="btn alt" href="index.html#artworks">Return to gallery</a></p></div>`;
    return;
  }

  const collectionName = data.collections?.name || "Collection";
  renderArtwork(el, data, collectionName);
  attachImageFallback(el);
  attachZoomHandlers(el);
  setupArtworkThumbs(el);
  setupArtworkMetadata(data, collectionName);
  await setupCheckoutButton(client);
  await setupForm(client);
}

init();
