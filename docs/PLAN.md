# Ocular — production build plan

Living document. Execution order is top to bottom; each phase leaves the
extension in a working state.

**Status: Phases 0–5 implemented.** What remains is browser and deploy
verification, which needs a real Chrome session and a Cloudflare account — see
[Verification](#verification) for exactly what is and isn't proven.

**Decision: AI is out of scope for now.** `src/lib/ai.js` stays on disk and the
default provider is `'off'`, so nothing in the checking path calls it. Revisit
once the deterministic pipeline is proven against live sites.

---

## Constraint that governs everything: don't lose the user's data

For an unpacked extension Chrome derives the extension ID from **the folder
path**, and `chrome.storage.local` is keyed to that ID.

> Loading a different folder = new ID = **all tracked products and price history
> gone.**

Therefore sources live in `src/`, but **the build writes to `extension/`** — the
folder already loaded in Chrome. Same path, same ID, same data. This is why the
output folder isn't called `dist/`; see the comment at the top of `build.mjs`.

---

## Phase 0 — Fix the dead button, kill silent failures ✅

**Bug:** clicking the green "Watching" button did nothing.

**Root cause:** `send()` in the content script caught every error and returned
`null`; `togglePanel()` read `null` as "not tracked" and removed the panel. Any
failure was therefore invisible. The two real triggers were a stale content
script (page not refreshed after an extension reload) and a service worker
missing the newer message handlers.

- [x] `send()` returns `{ ok:false, error, stale }` instead of swallowing
- [x] Panel renders a visible error state; never silently vanishes
- [x] Stale-context detected explicitly → "Ocular was updated. Refresh this page."
- [x] Version stamp in the panel footer so the live build is identifiable

## Phase 1 — Build system ✅

Declared content scripts can't be ES modules, so the old code used
`import(chrome.runtime.getURL(...))` — which is evaluated against the **page's**
CSP on some Chrome versions, and every retailer we target ships a strict CSP. It
worked by luck. Bundling removes the failure mode.

**esbuild**, not WXT/Vite: one dev dependency, no framework churn, and the UI is
plain HTML/CSS that gains nothing from React.

- [x] `build.mjs` — bundles entry points, copies assets, writes to `extension/`
- [x] `npm run build` / `dev` (watch) / `zip` (store package) / `test`
- [x] Sources moved to `src/`
- [x] Manifest version synced from `package.json`
- [x] Build fails on a manifest referencing a missing file
- [x] `web_accessible_resources` removed entirely — `lib/` is no longer exposed to pages

## Phase 2 — Beat the blocking ✅

Escalation ladder in `src/checker.js`, cheapest first, remembering which rung
worked per hostname.

1. **`fetch`** — invisible, fast, free
2. **Hidden tab** — `chrome.tabs.create({ active:false })`, wait for the content
   script to report a price, close the tab. Hard to block because it *is* a real
   page view with a real renderer and real cookies.
3. **Give up gracefully** — back off, keep passive logging alive

- [x] Per-host strategy memory (`fetch` / `tab`), so discovery is paid once
- [x] Tab checks serialised through a promise queue — never two at once
- [x] Tab always closed in `finally`; a leaked tab is worse than a failed check
- [x] Poll `ocular:scrape` until the price renders (SPAs paint late)
- [x] `chrome.scripting` injection fallback for user-added hosts
- [x] Automatic tab checks wait for `chrome.idle`; manual "Check now" never does
- [x] Exponential backoff per host: 1h → 3h → 12h → 24h
- [x] Setting to disable tab checks entirely

## Phase 3 — Cloudflare Workers + Cron ✅

Accepted going in: **the worker will be blocked by Amazon/Flipkart** because it's
a datacenter IP. It earns its place on smaller retailers with clean JSON-LD.

**Conflict rule: the browser always wins.** Server readings are advisory and only
fill gaps, via `mergeHistory()`.

- [x] `worker/` — wrangler config, D1 schema, cron every 30 min
- [x] Anonymous device token (UUID) — no accounts, no email
- [x] `POST /sync` (watchlist up, prices down), `GET /health`
- [x] Server extraction via `src/lib/htmlscan.js` — JSON-LD + meta only, no DOM
- [x] Per-host cron caps so one watchlist can't concentrate traffic
- [x] Exponential backoff on blocks: 1h → 6h → 24h → 3d
- [x] Extension client (`src/lib/sync.js`), **off by default**, opt-in in options
- [x] Sync on browser startup — the gap it exists to close

## Phase 4 — Backup ✅

- [x] Versioned export schema + `SCHEMA_VERSION`
- [x] Export via `chrome.downloads` (data URL — service workers have no `createObjectURL`)
- [x] Import **merges, never replaces**: restoring an old backup can't delete
      newer products or truncate grown histories
- [x] Migration runner keyed on schema version; v1 exports still import
- [x] Automatic backup on a configurable interval
- [x] API keys stripped from exports — backups land in the Downloads folder

## Phase 5 — UI polish ✅

- [x] Shared tokens (`src/ui/tokens.css`), light + dark
- [x] Popup: loading / empty / error / disconnected states, thumbnails, sparkline
      with low + current markers, status chips, per-product alert rules
- [x] In-page panel: scoped tokens (no `:root` leakage into retailer CSS),
      dark-mode aware, Escape to dismiss, honest health line
- [x] Options: grouped cards, switches, nested-control enable/disable, diagnostics
- [x] First-run onboarding — including the "only while Chrome is open" caveat
- [x] Accessibility: focus rings, `aria-label`s, `role="status"`, `prefers-reduced-motion`

---

## Verification

| Claim | How it's backed |
|---|---|
| Price parsing, canonicalisation, extraction ladder | **Verified** — 58 tests, `npm test` |
| Backup merge / validate / migrate round-trips | **Verified** — unit tests incl. idempotency |
| Alert rules, incl. fake-sale resistance | **Verified** — unit tests |
| DOM-free worker extraction matches the browser | **Verified** — unit tests |
| Bundles contain no ESM leftovers or dynamic `lib/` imports | **Build-checked** — grepped |
| Manifest references resolve | **Build-checked** — build fails otherwise |
| Hidden-tab checking, notifications, idle deferral | **Unverified** — needs a live browser |
| Whether retailers block us in practice | **Unverified** — needs live traffic |
| Worker deploy, D1, cron | **Unverified** — needs a Cloudflare account |

- [x] `test/` with `node --test`, 58 tests
- [x] `npm test` green
- [x] Manifest reference validator in `build.mjs`

---

## Next

1. **Load and exercise it** — the unverified rows above are the whole remaining risk.
2. Percent/median alert rules exist in the data model *and* the popup UI; confirm
   they fire correctly once histories are long enough to have a real median.
3. Deploy the worker only if you track retailers beyond Amazon/Flipkart.
4. Store submission: privacy policy, screenshots, $5 developer fee.
