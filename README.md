# Art & Soul Virtual Gallery Starter

This folder gives you a custom, editable starter for your virtual gallery.

## Files
- `index.html` - page structure and copy placeholders
- `styles.css` - warm, sacred desert visual style
- `script.js` - returning visitor messages, rotating blessing, Ask the Artist behavior
- `config.js` - one place to set your form endpoint and collector email

## Run Locally
Open `index.html` in your browser.

## What To Customize First (Small Chunks)
1. Configure contact delivery:
- Open `config.js`
- Set `askArtistEndpoint` to your real Formspree endpoint (example `https://formspree.io/f/abcdwxyz`)
- Set `collectorEmail` to your real email

2. Replace Stripe placeholder links:
- Find `REPLACE_WITH_LINK` placeholders in `index.html`
- Paste your Stripe Payment Link per piece

3. Add your own images:
- Add image files to this folder (example: `images/desert-hero.jpg`)
- Update hero/background and artwork blocks in `index.html`

4. Expand or reorder pieces:
- 8 pieces are already installed in `index.html`
- Edit title, whisper line, story, room language, and CTA as needed

## Form Behavior (Current)
- If `askArtistEndpoint` is configured, forms submit there via AJAX.
- A local backup copy is still stored in browser `localStorage`.
- If endpoint is missing/invalid, submissions stay local and show a setup reminder.

## Suggested Next 4 Steps
1. Add your real Formspree endpoint in `config.js`.
2. Replace Stripe links for each sellable piece.
3. Add room-specific pages and link cards to those pages.
4. Deploy on a custom domain.

## Copy Source
Use `/docs/content-pack.md` as your canonical gallery language.
Use `/docs/blueprint.md` for build and operations planning.
