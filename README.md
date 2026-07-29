# Ocular

A free, local-first price watcher for online shopping. Open a product page, press
**Monitor price**, and Ocular tracks it from then on — no account, no server, no
data leaving your machine.

> **Working on this repo?** Start with [OWNERSHIP.md](OWNERSHIP.md) — it says
> which files are yours — then [CONTRIBUTING.md](CONTRIBUTING.md).

## Quick start

```bash
npm install
npm test         # 72 tests across the JS workspaces
npm run build    # builds the extension into ./extension
```

Chrome → `chrome://extensions` → **Developer mode** → **Load unpacked** → select
the **`extension/`** folder at the repo root. Pin Ocular from the 🧩 menu.

> Load `extension/`, **not** `packages/extension/`. Chrome derives an unpacked
> extension's ID from its folder path, and all stored data is keyed to that ID.

## Repo layout

```
packages/
  shared/      pure logic used by all three runtimes — contract, review required
  extension/   the Chrome MV3 extension                       Sathwik
  backend/     Cloudflare Worker: checks while the browser is closed
                 src/routes  src/db  src/lib   Rohith
                 src/checker                   Harsha
  ai/          deal-verdict + extraction models (Python)      Sathwik
  web/         landing page, demo, privacy policy             Sumith
docs/
  ARCHITECTURE.md   how it fits together and why
  API.md            the two network contracts
  PLAN.md           build plan and verified/unverified status
extension/     BUILD OUTPUT — load this in Chrome, never edit by hand
```

## How it works

```
content script  ──  reads prices off pages you visit (free, unblockable)
      │
      ▼
service worker  ──  alarms → checker ladder → offscreen doc parses HTML
      │                fetch → hidden tab → back off
      ▼
chrome.storage.local ── products + price history + per-host strategy
      │
      ├──▶ notifications, backup export/import
      └──▶ optional Cloudflare worker (checks while the browser is closed)
```

### Why checks run in your browser

Retailers block datacenter IPs aggressively. A free-tier server gets captcha'd
within days, and the fix is residential proxies — which cost money and end
"free". Your browser already has a real User-Agent and your own session cookies.
That is the whole advantage.

Trade-off: automatic checks run only while the browser is open. Passive logging
from pages you naturally visit covers much of the gap.

### The checking ladder

| Rung | Method | Notes |
|---|---|---|
| 1 | `fetch` | Invisible and free. Works on well-behaved retailers. |
| 2 | Hidden tab | A real background tab with a real renderer. Very hard to block — it *is* a page view. Closed immediately after. |
| 3 | Back off | 1h → 3h → 12h → 24h per host. Passive logging continues. |

Whichever rung worked is remembered **per hostname**, so discovery is paid once.

### The extraction ladder

Site-specific CSS selectors rot constantly — Flipkart hash-rotates class names on
every deploy. So five strategies run, most durable first:

| # | Strategy | Notes |
|---|---|---|
| 1 | **JSON-LD** `Product` | Most retailers ship it for Google Shopping. Highest-value rung by far. |
| 2 | **Meta / microdata** | `product:price:amount`, `itemprop="price"` |
| 3 | **Site selector pack** | Expected to break; low severity. |
| 4 | **Visual heuristic** | Scores currency-shaped text nodes. Demotes strikethrough, "M.R.P", EMI, "you save". |
| 5 | **AI** | Last resort. Returns a selector that gets cached per site. |

`parsePrice()` handles Indian lakh grouping (`₹1,29,999`), Western
(`$1,299.00`) and European (`1.299,00 €`) conventions.

### Why alerts use the median

Percent and median rules anchor to the **90-day median**, never the previous
price and never the listed M.R.P. That defeats the pre-sale price hike — raise a
price for a week, then "discount" it — which is rampant during Indian sale
events. A 40% cut off an inflated price won't fire an alert.

## Testing

```bash
npm test                          # all JS workspaces
cd packages/ai && pytest          # AI baseline
```

72 JS tests and 11 Python tests cover price parsing across three grouping
conventions, URL canonicalisation, all five extraction rungs against jsdom
fixtures, the DOM-free worker scanner, backup merge/validate/migrate, sync
routing and auth, and the deal-verdict baseline including a fake-sale regression.

Not covered — needs a real browser or a live deploy: hidden-tab checking,
notifications, whether retailers actually block us, and the worker in production.
[docs/PLAN.md](docs/PLAN.md) has the honest verified/unverified split.

## Status

| Area | State |
|---|---|
| Extension | Working. Tracking products, background checks confirmed running. |
| Backend | Written and unit-tested. **Never deployed.** |
| AI | Deterministic baseline works and is tested. No trained model yet. |
| Web | Skeleton with real copy. Needs design + demo capture. |

## Publishing

- Chrome Web Store: **$5 one-time** developer fee. Firefox AMO is free.
- `npm run zip` produces a store-ready package (~45 KB minified).
- A reachable **privacy policy URL is required** — `packages/web/public/privacy.html`.
- Ocular is user-initiated, personal-use, and runs in the user's own browser on
  pages they can already see. Don't turn it into a server-side scraping farm,
  don't redistribute retailer data, keep the rate limits polite.
