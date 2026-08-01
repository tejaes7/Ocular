# @ocular/web

**Owner: Sumith.** Landing page, demo, download, and the legal pages.

This is a **starting skeleton, not a design**. Replace it. It exists so there's
working structure, correct copy, and the right meta tags from day one — the
visual design is yours.

```bash
npm run dev -w @ocular/web       # serves public/ on :3000
```

## What the page has to do

In priority order:

1. **Explain it in one line.** "Watch prices on the products you care about."
2. **Show it working.** A demo carries this product far better than words — see below.
3. **Get the extension installed.** One obvious button.
4. **Answer the obvious objection.** "Is this spying on me?" → no account, no
   server, nothing leaves your browser. That is the strongest differentiator
   against BuyHatke and similar; lead with it, don't bury it.

## Assets needed

| Asset | Notes |
|---|---|
| Demo video / GIF | 15–25s: open a product page → press **Monitor price** → button turns green → popup shows the watchlist. Silent, looping, `autoplay muted playsinline`. Keep it under ~3 MB or lazy-load it. |
| Popup screenshot | Light and dark. Real data, not lorem — fake prices read as fake. |
| In-page button screenshot | On a real product page. Blur anything personal. |
| OG image | 1200×630, for link previews. |

## Required before Chrome Web Store submission

The store **will not approve** the listing without a reachable privacy policy
URL. `public/privacy.html` is that URL. It is a static file in `public/` so it
stays reachable regardless of the React build, and its styles are inlined —
it previously linked a `styles.css` that was deleted in the Vite migration, and
nothing reported the page rendering unstyled.

What it currently claims, all of which is checked against the code:

- No analytics, no tracking, nothing sold or shared.
- Price history is stored locally in the user's browser.
- Optional sync is off by default; when enabled it sends product URLs and an
  anonymous device UUID to a self-hosted worker.
- Accounts are optional, and **never linked to price data**.

**Do not add a second copy of this text in a component.** A footer modal used to
carry its own two-sentence version, which said different things and could not
serve as the store's policy URL. The footer links to the page.

Check this against what the code actually does before publishing. If sync or
accounts ever start collecting more, this page changes first, in the same PR.

## Design system

`public/styles.css` imports the same tokens the extension uses
(`packages/extension/src/ui/tokens.css`). Keeping the site and the product
visually consistent is worth more than a novel landing-page look.

The visual language is deliberately monochrome — colour means "price went
down/up" and nothing else. Please keep that on the site too.

## Deploying

Static output, so anything works. Cloudflare Pages keeps it on the same account
as the backend; Vercel is the easier deploy. Point the repo at either and it
builds with no config.
