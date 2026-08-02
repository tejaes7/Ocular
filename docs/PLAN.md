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
- [x] Anonymous device token (UUID) — no email, and it is the *only* identity
      `/sync` accepts. Optional accounts arrived later via `GET /me` and are
      deliberately kept apart from price data; see the identity table in
      `docs/API.md`
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

## Phase 6 — Closing the "my laptop was closed" gap ✅ (2026-08-02)

The complaint this phase answers: tracking only worked while Chrome was open,
and heavy retailers timed out when it was.

**Reliability**

- [x] Hidden-tab checks no longer gate on `tab.status === 'complete'`. One 25s
      deadline was shared between waiting for load and polling for the price;
      `complete` waits on every ad, beacon and analytics request, so the price
      poll got under a second on exactly the sites that matter. Total unchanged,
      so sweep duration doesn't regress.
- [x] Content-script injection retries instead of latching after one attempt
- [x] The in-page button appears on client-rendered stores. `evaluatePage()`
      treated the first failed scrape as final, and nothing retried — the
      observer only re-ran on a URL change, and a price arriving isn't one.
- [x] Double-injection guard (manifest and checker can both inject one frame)

**The server actually reaching the user**

- [x] Server-found drops update `lastPrice` and raise an alert on next sync.
      They were merging into history and stopping, so the worker produced no
      visible outcome at all.
- [x] Backfilled gap readings never alert; a long shutdown produces one alert
      per product, not one per merged row
- [x] Dormant devices (30d+) stop being checked, so the cron budget goes to
      users who are still listening
- [x] Email alerts for drops found while the browser is closed, gated on device
      away 6h+, 5+ server readings, 10%+, once per price, 24h cooldown
- [x] `POST /link` joins device to account; `/sync` reports `linked`, never sets it
- [x] Pairing flow — the extension opens `<site>/?pair=<deviceId>` rather than
      growing its own sign-in

**Overlay**

- [x] The Monitor button is draggable, persists position, and survives a
      viewport change without stranding itself off-screen

**Decision recorded:** split identity was overturned for this. See
`migrations/0003_email_alerts.sql`, `docs/API.md`, and the privacy page — which
now states plainly that with alerts on, a watchlist stops being anonymous.

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

- [x] `test/` with `node --test` — **177 tests** (75 shared, 34 extension, 68 backend)
- [x] `npm test` green
- [x] Manifest reference validator in `build.mjs`

Added in Phase 6 and worth knowing what they do *not* cover: the email decision
logic, the link/unlink auth asymmetry, the catch-up decision and the overlay
geometry are all unit-tested. **No test exercises a real email send, a real
Firebase token, or a real D1.** Those need `wrangler dev` and a live browser.

---

## Next — start here in a new session

**The backend is deployed (2026-08-03).** That was the blocker behind everything
else, and it is gone.

| | |
|---|---|
| Worker | `https://ocular.eeramallateja24bcd40.workers.dev` |
| Site | `https://ocular-web-three.vercel.app` |
| D1 | `ocular` — all three migrations applied to the remote |
| Cron | every 30 min, live |

Both constants in `packages/extension/src/lib/store.js` are filled in, so sync
is **on by default** and the closed-browser path is no longer inert. The deploy
ordering constraint that used to sit here is satisfied: the endpoint was set
before the privacy page's "on by default" claim became true of a shipped build.

Verified against the live deployment, not a stub: `/health` reports the D1
connected, unauthenticated `/sync` is still 401, a product round-trips, a
250-product payload returns 413 without writing or deleting anything, and the
`complete` flag gates reconciliation in both directions. Test rows removed.

**1. Email alerts — the only configuration still outstanding**

- `wrangler secret put RESEND_API_KEY`
- `wrangler secret put ALERT_FROM_EMAIL` — must be on a Resend-verified domain,
  or every send fails with a 403 that reads like an auth error
- `VITE_API_BASE` in the Vercel project, so the pairing page can reach the
  worker. Without it `api.js` has no backend to call and `/?pair=` cannot work.

Until all three are set, everything else runs: prices are checked while the
browser is closed and pulled down on the next sync. Only the *email* is missing.

**2. Load the rebuilt extension.** The endpoint is baked into the bundle at
build time, so an already-installed unpacked copy keeps the old empty default
until `npm run build` output is reloaded in Chrome.

**3. Verify the loop end to end** — the one thing no test covers:

track a product → wait for a server check → confirm a price row in D1 → pair a
browser via the options page → force a drop → confirm the email arrives → press
"Turn off" → confirm `devices.user_id` is null.

The first half of this is now unblocked and worth doing before the Resend
secrets exist: track a real product, wait for a cron tick, and check the
`prices` table. That proves the checker against live retailers, which is the
part no unit test can reach.

**4. Then the older items**, unchanged: exercise hidden-tab checking in a live
browser, confirm percent/median rules fire once histories have a real median,
and store submission (screenshots, $5 fee).

**Open decisions, not tasks:**

- **The AI dataset.** Linked devices are no longer anonymous, and the export
  path doesn't know it. Needs an exclusion or a link-strip before collection
  starts in earnest — see the 2026-08-02 entry in `packages/ai/WORKLOG.md`.
- **Review.** Phase 6 touched `packages/backend` and `packages/web` under
  delegated ownership. CODEOWNERS still routes those to Rohith, Harsha and
  Sumith, and `privacy.html` specifically needs Sumith.
