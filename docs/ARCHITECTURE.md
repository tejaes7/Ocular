# Architecture

## The decision everything else follows from

**Price checks run in the user's browser, not on a server.**

Retailers block datacenter IPs aggressively. A free-tier server gets captcha'd
within days, and the fix is residential proxies — which cost money and end
"free". The user's browser already has a real User-Agent, a real renderer, and
their own session cookies. That is the whole advantage, and most of the design
falls out of protecting it.

The costs we accept in exchange:

- Automatic checks run only while the browser is open. Passive logging (recording
  the price of any tracked page the user happens to open) covers much of the gap.
- The optional worker covers the rest, but only where retailers tolerate it.

## Shape

```
        ┌──────────────────────── browser ────────────────────────┐
        │                                                          │
        │  content script ──── reads prices off pages you visit    │
        │        │              (free, unblockable, passive)       │
        │        ▼                                                 │
        │  service worker ──── alarms → checker.js ladder          │
        │        │               fetch → hidden tab → back off     │
        │        │                        │                        │
        │        │                        ▼                        │
        │        │              offscreen doc (DOMParser)          │
        │        ▼                                                 │
        │  chrome.storage.local                                    │
        │    products · price history · per-host strategy          │
        │        │                                                 │
        │        ├──▶ notifications                                │
        │        ├──▶ backup export/import (JSON)                  │
        │        └──▶ optional sync ──┐                            │
        └────────────────────────────┼────────────────────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │  Cloudflare Worker + D1        │
                    │  cron → fetch → JSON-LD scan   │
                    │  (blocked by big retailers —   │
                    │   supplement, never authority) │
                    └────────────────────────────────┘

                    ┌────────────────────────────────┐
                    │  AI service (FastAPI)          │
                    │  /verdict  is this a good buy? │
                    │  /extract  last-resort price   │
                    └────────────────────────────────┘
```

## Packages

| Package | Runtime | Owner |
|---|---|---|
| `shared` | anywhere — pure functions only | contract, review required |
| `extension` | Chrome MV3 | Sathwik |
| `backend` | Cloudflare Workers | Rohith + Harsha |
| `ai` | Python / FastAPI | Sathwik |
| `web` | static | Sumith |

## Invariants

These are load-bearing. Breaking one causes a bug that looks like something else
entirely.

### 1. The browser is the source of truth

Server readings only ever *fill gaps*. They never overwrite a browser
observation. The worker is on a datacenter IP and is the side more likely to be
handed a stale page, a regional price, or an anti-bot placeholder.

Enforced by `mergeHistory()` in `shared/src/history.js`, which is order-independent
and idempotent.

### 2. The extension build output path never moves

Chrome derives an unpacked extension's ID from its **folder path**, and
`chrome.storage.local` is keyed to that ID. Moving the build output means every
user silently loses every tracked product and their entire price history.

This is why the loadable build sits at repo root as `extension/` rather than
inside its package as `dist/`. It looks odd in a monorepo. It is deliberate.

### 3. A wrong price is worse than no price

A bad reading poisons the stored history, shifts the median, and fires a false
"lowest ever" alert. Every layer prefers to fail loudly:

- `parsePrice()` rejects zero and negative values.
- `scanHtml()` checks for anti-bot pages *before* trying to read a price, so a
  captcha page can't be parsed as a ₹1 product.
- The AI `/extract` endpoint 501s rather than guessing.

### 4. Relative alerts anchor to the 90-day median

Never the previous price, never the retailer's M.R.P. This is what defeats the
pre-sale price hike — raise a price for a week, then "discount" it — which is
rampant during Indian sale events.

The same `median90` value drives alert rules *and* AI features, which is why
`history.js` lives in `shared`. If those two ever disagree, the product
contradicts itself.

## Platform constraints worth knowing

These caused real bugs. They are not obvious.

| Constraint | Consequence |
|---|---|
| MV3 service workers have **no DOM** | HTML parsing goes through an offscreen document |
| Declared content scripts **can't be ES modules**, and dynamic `import()` is subject to the *page's* CSP | Everything is bundled; don't reintroduce runtime imports |
| Service workers have **no `URL.createObjectURL`** | Backups download as data URLs |
| `chrome.alarms` clamps periods under 1 minute | Minimum check interval is 30 min |
| Service workers are torn down when idle | Sweep gaps stay under ~30s |
| Cloudflare Workers have **no DOM** | Server extraction is JSON-LD + meta only (`htmlscan.js`) |

## What deliberately doesn't exist

- **Accounts.** The device UUID is already an identity; sign-in would only add
  recoverability. A recovery code gets that without collecting anything personal
  — and a watchlist reveals what someone is buying, which is more sensitive than
  it first looks.
- **Analytics.** No telemetry of any kind. It would be the first thing to
  contradict the privacy claim on the landing page.
- **A price-comparison crawler.** Matching products across retailers is a much
  harder problem than watching one URL, and it is where scraping stops being
  personal-use.
