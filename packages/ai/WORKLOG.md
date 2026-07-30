# AI worklog — Sathwik

Running context for the AI track. **Append to this at the end of every working
session**, newest entry at the bottom. It exists so a new session (human or
assistant) can be brought fully up to speed by reading this one file.

Owner: Sathwik. Scope: `packages/ai/`, `packages/extension/`, plus review duty on
`packages/shared/` and `docs/API.md`.

---

## The job in plain language

Read this section first. The rest of the file is the same thing in shorthand.

**The feature:** given a product's price history, say *buy now* or *wait*.

```
Input:   [10000, 10000, 10000, 9900, 9800, 8500]   prices over ~2 months
Output:  "buy_now"  +  "About 15% below its usual price."
```

That is the whole AI surface of this product. Nothing else.

**It already works without ML.** `baseline.py` answers this with ~60 lines of
if-statements ("8% below usual → buy_now"). It is tested and it ships. The job is
to replace it with a trained model **that does measurably better** — and to keep
the if-statements as the fallback for when the model is missing or broken.

**Why this is not a normal ML project.** There is no CSV. Two gaps:

- *No answer column.* Nobody labelled any price history "buy" or "wait".
- *No data at all.* The app has zero users, so zero price histories exist.

Closing those two gaps is most of the work. Training the model at the end is the
familiar part.

**Gap 1 — labels come from the future of the same array.** Stand on day 10 of a
history. Look ahead at days 11–40. If the price fell 5% or more, the right answer
on day 10 was "wait" → label 1. Otherwise 0. Every day of every history becomes a
labelled row, with no human annotation. (Start with 5% and 30 days.)

**Gap 2 — generate the data.** Write a script that invents realistic histories in
five shapes: flat, slow decline, seasonal dip, **fake sale**, and noisy. The fake
sale is the important one: ₹10,000 for months → spike to ₹20,000 for a week →
"discount" to ₹11,000. That scam is the reason this product exists.

**Features are already written.** `features.py` turns one price history into 14
numbers. Call it; don't rewrite it. (Rewriting it is how you get a model that
scores well in testing and behaves badly for real users — the numbers it trains
on stop matching the numbers it sees live.)

**First thing to build:** the fake-data generator (task 2 below). Everything else
is blocked on it.

---

## Where the AI actually stands

Two AI tracks exist in this repo and **they are not connected to each other**.
Neither one runs today.

| | Track A — in-browser LLM | Track B — Python service |
|---|---|---|
| Location | `packages/extension/src/lib/ai.js` | `packages/ai/` |
| Approach | BYOK: Chrome on-device Gemini Nano, or the user's own Gemini/Anthropic key | Deterministic rules over price history |
| Entry points | `extractPriceWithAi()`, `judgeDeal()` | `POST /verdict`, `POST /extract` |
| Status | `provider: 'off'` — `packages/extension/src/lib/store.js:48`. Nothing calls it. | Implemented + tested. Never deployed. **No HTTP client exists anywhere.** |

Verified by grep: no file in `packages/extension` or `packages/backend` fetches
`/verdict`. `judgeDeal()` is exported and has zero callers. `docs/PLAN.md:11`
parked the whole AI track deliberately.

**Consequence: the first decision is topology, not modelling.**

## Files that exist vs. files the docs promise

Present:

```
src/ocular_ai/service.py     FastAPI — /health, /verdict, /extract(501)
src/ocular_ai/schemas.py     pydantic models, mirrors docs/API.md
src/ocular_ai/features.py    14-field PriceFeatures, training+serving
src/ocular_ai/baseline.py    deterministic judge(); model to beat
tests/test_baseline.py       11 tests, incl. the fake-sale regression
training/README.md           labelling strategy + the four traps
```

Referenced in `README.md:55` but **not written yet**:

```
training/build_dataset.py    exported histories -> labelled rows
training/train_verdict.py    train + persist
eval/metrics.py              MUST compare against baseline, not just report accuracy
data/                        gitignored; never commit user data
```

## Topology recommendation (2026-07-29, not yet ratified)

Do **not** deploy a verdict server.

1. Port `baseline.py` to `packages/shared/src/verdict.js`. Verdicts run offline
   and instantly, and price history never leaves the device — which is what the
   landing page promises. Python stays as the training lab and the reference
   implementation; `tests/test_baseline.py` becomes a cross-language conformance
   suite.
2. Train in Python, **ship the weights as JSON**. The feature vector is 14
   numbers. A logistic regression is a dot product (~20 lines of JS); a small
   GBM serialises to JSON and evaluates in ~40. No server, no cold start, no
   privacy trade-off, works offline.
3. Keep FastAPI for `/extract` only — that genuinely needs a large model, it is
   the rare rung-5 path, and BYOK in `lib/ai.js` already covers it.

Trade-off accepted: shipping a new model means shipping an extension update, so
iteration is gated on store review (days, not minutes). Worth it for a model
that is retrained rarely. Revisit if verdict quality starts needing weekly
retrains.

`OWNERSHIP.md:48` assigns this decision to Sathwik.

## Task order

| # | Task | Status |
|---|---|---|
| 0 | Ratify topology; record it in `docs/PLAN.md` | open |
| 1 | `training/build_dataset.py` — backup JSON -> labelled rows | open |
| 2 | Synthetic series generator (flat/trend/seasonal/fake-sale/noisy) — there are no users, so there is no real data | open |
| 3 | `eval/metrics.py` — baseline-relative, precision/recall/PR-AUC | open |
| 4 | Freeze the 11 `test_baseline.py` cases into the eval set | open |
| 5 | `training/train_verdict.py`; ship only if it beats baseline | open |
| 6 | Wire the extension to call verdict, with baseline fallback | open |
| 7 | `/extract` model (lowest priority; 501 is correct until then) | open |

## Rules that must not be broken

- **The baseline always answers.** A model outage degrades to blunter advice,
  never to a 5xx. Callers treat 5xx as "AI is broken" and hide the feature.
  `service.py:5`.
- **A wrong price is worse than no price.** `/extract` 501s rather than guessing.
  A bad reading poisons stored history, shifts the median, and fires a false
  "lowest ever". `docs/ARCHITECTURE.md:88`.
- **Use `features.extract_features()` in training *and* serving.** Reimplementing
  it is training-serving skew — scores well offline, misbehaves live.
- **Anchor to the 90-day median**, never previous price, never M.R.P. This is
  what defeats the pre-sale hike. Same `median90` drives alerts *and* AI
  features, which is why `history.js` lives in `shared`.
- **Never commit real user data.** `data/` is gitignored. Own exports and
  synthetic series only, until there is an opt-in flow with a privacy policy.
- **The extension build output path never moves.** `build.mjs` writes to
  `<repo root>/extension/`. Chrome derives an unpacked extension's ID from its
  folder path and `chrome.storage.local` is keyed to that ID — moving it wipes
  every user's history.

## Modelling notes

Labelling is programmatic, no annotation needed: for a reading at time `t`,
label 1 if the price drops at least `X%` below it within `N` days. Start
`X=5, N=30`. Traps, all four of which are easy to hit:

- **Leakage** — computing features for time `t` using readings after `t`.
- **Row splits** — split by product, not by row; readings within a product are
  heavily autocorrelated and a random split inflates the score.
- **Class imbalance** — always-"wait" scores ~85% accuracy and is worthless.
  Report precision/recall and PR-AUC.
- **Compaction** — the extension collapses runs of identical prices into one
  point with a moving `lastSeen`. Re-expand to a daily series first or
  `days_since_min` is wrong.

---

## Session log

### 2026-07-30 — PR #3 merged, but it dropped the accuracy fix (branch `fix/selector-fallback`)

**PR #3 is merged** (`c76c3e6`, by Harsha, 02:35 IST). Everything from passes one
and two is on `main`: `hasLayout()`, the score-only tie-break, `UNIT_PRICE_RE`,
`isPlausibleReading()`, `repairHistory()`, `SCHEMA_VERSION` 3 + migrations,
provenance through merges, alert gating on low confidence.

**The merge captured a stale head and silently dropped two commits.** The merge
commit's second parent is `af75e9c` — the commit *before* the third pass:

```
c76c3e6  parents = a1b1ff6  af75e9c
                            └── not 32f5120, the branch tip
```

`4c6a9b8` (the `fromSelectors` fix) and `32f5120` (its worklog entry) were pushed
~11 minutes before the merge and never landed. Verified directly against
`origin/main`: it still reads `const el = firstMatch(doc, selectors)`.

**Nothing in the GitHub UI flags this.** #3 shows as fully merged, the branch shows
as merged, and the dropped commits are still reachable on the head ref — so the
only way to catch it is to diff the branch against `main` after the merge, or check
the merge commit's parents. Worth doing routinely: `git log --oneline
origin/main..<branch>` should be empty after a merge, and here it wasn't.

Consequence while `main` was in that state: rung 4 dead on every site → Amazon
reads fall to the heuristic → `confidence: 'low'` → `isPlausibleReading` and
`maybeNotify` (both merged) correctly refuse them. So the passes that shipped were
actively discarding the readings the pass that didn't ship would have made valid.
**Under the collect-then-train plan that is the worst possible pairing to ship
half of** — five months of correctly-rejected garbage instead of selector reads.

**Fix: PR #4** — https://github.com/tejaes7/Ocular/pull/4. The two commits
cherry-picked onto current `main`, clean, no conflicts, no new work. 4 files,
+198/−42. 98 tests green (74 shared + 12 extension + 12 backend); both CI jobs
pass. CODEOWNERS auto-requested `@harsha20112986-droid` — confirming the handle fix
in `5f8dddf` works, since #3 had to be requested by hand.

The two findings handed to Harsha (sound `looksBlocked`, wrong `scanHtml` title on
Amazon) are restated in #4's description, because #3 being closed buries them.

**Still open:**
- **Harsha's review on PR #4** (`shared/**` is his).
- **Manual step, cannot be scripted:** reload Ocular at `chrome://extensions`.
  The v3 migration runs on the next service-worker startup and logs what it
  dropped. Still not done — and it is now the only way to confirm `repairHistory`
  behaves on the real profile rather than on the export.
- The anonymous collection endpoint. Needs Rohith (transport) and Sumith (policy).
- `packages/backend` still does not use `isPlausibleReading`. Harsha's call.
- Tasks 0–7 below are all untouched. Task 2 (synthetic generator) is void under the
  ratified no-synthetic-data decision; the table above still lists it as open and
  should be corrected when someone next edits it.

### 2026-07-29 — data-quality fixes (branch `fix/extraction-provenance`)

**Decision ratified: no synthetic training data.** Ship the deterministic
pipeline, run it for 5–6 months, collect real histories, then train. This makes
the *current* extraction and storage code the thing that determines whether the
eventual training set is usable, so data quality is now the priority over
modelling.

**Decision: collection is automatic and anonymous.** Upload product price series
only — one-way product hash, no device linkage, no URL, no title, no account.
Rejected the Google-auth proposal: OAuth supplies identity, which this dataset
specifically must not have, and it contradicts `ARCHITECTURE.md` ("no accounts",
"no telemetry"). Sumith documents the collection in the privacy policy before
launch; Sathwik reviews it per CODEOWNERS. Not yet implemented.

**Confirmed a real extraction bug from live data** (`ocular-backup-2026-07-29`).
Product `p2sg5oo`, an Amazon pack-of-4 actually priced ₹349, was recorded as
₹94.75 twice and then ₹8.75. Perfect correlation: every `page-visit` reading was
₹349, every `check` reading was junk. ₹94.75 is 379 ÷ 4 — the per-unit price.

Two compounding causes, both now fixed:

1. `fromHeuristic` scored font size and line-through via `getComputedStyle`, which
   is unreachable on a `DOMParser` document — and every `fetch` check parses HTML
   in the offscreen document. Those signals evaluated to **zero rather than
   failing**, collapsing all candidate scores into a tie.
2. The tie-break was `|| a.value - b.value`, **ascending**. So a tie returned the
   cheapest currency-shaped string on the page. Guaranteed underestimate →
   guaranteed false "price drop".

Fixed, with 16 new tests (72 → 88 total, all green):

| Issue | Fix | File |
|---|---|---|
| Heuristic blind on parsed docs | `hasLayout()` — a `DOMParser` doc has no `defaultView`; refuse when ambiguous and unrendered, letting the checker escalate to a real tab | `shared/extract.js` |
| Cheapest-wins tie-break | rank on score only; compare **distinct** values across the contending band (nested div+span means each price is scored twice, so top-two comparison hid real ties) | `shared/extract.js` |
| Per-unit prices | `UNIT_PRICE_RE`, checked against parent text since "per count" is usually a sibling node | `shared/extract.js` |
| `strategy`/`confidence` computed then discarded | stored on every price row | `extension/lib/store.js` |
| Nothing guarded the write boundary | `isPlausibleReading()` — guessed readings must sit within 50% below / 100% above the median; structured rungs bypass. Asymmetric because every observed misread was an underestimate | `shared/history.js` |
| Guessed readings could raise alerts | `maybeNotify` refuses `confidence: 'low'` and `heuristic-blind` | `extension/background.js` |
| Any-drop rule had no fake-sale defence | also requires `price <= median90`, so a fall from an inflated spike back toward normal no longer fires | `shared/alerts.js` |
| 1% alert threshold | default now 5% | `extension/lib/store.js` |
| Silent history truncation | warns on truncation; cap raised to 20000 (`unlimitedStorage` is granted, so quota is not a constraint) | `extension/lib/store.js` |

Rejected readings increment `rejectedReadings` on the product and record
`lastRejection`, never entering history. **A rising count means a site's markup
moved and its selector pack needs attention** — that counter is the early warning
for the whole collection run.

**Second pass — repair and provenance durability (same branch):**

- `mergeHistory` rebuilt each point field-by-field and therefore **stripped the
  new `strategy` / `confidence` fields**. Any sync or backup import erased
  provenance. Fixed; provenance now survives a merge.
- `repairHistory()` in `shared/history.js` removes readings written before the
  gate existed. Those rows have no `strategy`, so a blind guess is
  indistinguishable from a JSON-LD reading. It judges them against the subset
  that *is* verifiable — rows with a `strategy`, plus any `source: 'page-visit'`
  row, since the content script always reads a live rendered document and so
  could never hit the unrendered-heuristic bug.
  **It deliberately does not use the full-series median.** On the real poisoned
  data the overall median was 94.75 — the junk value — so judging against it would
  have deleted the two correct ₹349 rows and kept the three bad ones. With no
  trusted subset it returns the history untouched; deleting on a guess is the
  same mistake inverted.
- `SCHEMA_VERSION` 2 → 3 plus `runStorageMigrations()`, called from both
  `onInstalled` and `onStartup` (a reloaded unpacked extension does not reliably
  fire `onInstalled`). Idempotent — the recorded version gates the work. Also
  corrects the denormalised `lastPrice` on the product, or the popup keeps showing
  a price that is no longer in the series.
- `restoreBackup` now repairs **after** merging, so importing a pre-v3 backup can
  no longer reintroduce the rows the migration just removed. Returns
  `pointsRejected` alongside `pointsAdded`.
- `migrate()` gained a v3 step. The repair is not done there on purpose: it needs
  the merged series to judge against, not the file in isolation.

Verified against the real export: `p2sg5oo`'s `median90` goes from the poisoned
**94.75 to the correct 349**, three junk rows dropped; the clean product is
untouched. 88 → 95 tests.

**PR: https://github.com/tejaes7/Ocular/pull/3** — `fix/extraction-provenance` →
`main`, 12 files, +964/−23, reviewer `@harsha20112986-droid`.

Also fixed on the way: `.github/CODEOWNERS` used the placeholder handle `@harsha`.
GitHub does not error on a handle it cannot resolve — it **silently skips the
review request** — so `/packages/shared/` and `/packages/backend/src/checker/` had
no effective reviewer at all. `@rohith` and `@sumith` are still placeholders and
still have that problem.

**Third pass — the actual accuracy bug (same PR).**

The first two passes stopped the guessing rung returning garbage but never
explained *why it was reached on Amazon at all*. Probing a live `amazon.in` page
answered it: **rung 4 — the site selector packs — was silently broken for every
site.**

`fromSelectors` called `firstMatch()`, took the one element it returned, and gave
up if that element's text did not parse. So it skipped only *absent* selectors,
never *failing* ones — and one present-but-empty node killed the whole list. An
ordered fallback list only has value if a failing entry is skipped.

Amazon does exactly that:

```
present, EMPTY   #corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen
present, EMPTY   #corePriceDisplay_desktop_feature_div .a-price .a-offscreen
"₹349.00"        #corePrice_feature_div .a-price .a-offscreen
```

The selectors were correct; the iteration was wrong. Amazon publishes **no JSON-LD
and no `og:price`** (verified — neither string appears in 2.6 MB of markup), so
rung 4 is its *only* reliable reader. Live, same page:

| Path | Before | After |
|---|---|---|
| rendered | `heuristic` / 349 / low | `selector` / **349** / high |
| offscreen (`fetch`) | **no-price** | `selector` / **349** / high |

This also shrinks the coverage trade-off from pass one: the heuristic's "decline
when unrendered and ambiguous" is now a genuine last resort rather than Amazon's
common path.

Settings page type scale raised too — it is a full browser tab, not the 380px
popup, and was rendering body copy at 12px and hints at 11px. Overrides live in
`options.css`, not `tokens.css`, so the popup and in-page panel are untouched.

**Technique worth reusing:** none of this was findable by reading code. Fetching
the real page and printing, per selector, whether it matched and what text it held
is what exposed it. Reach for that before theorising about extraction.

95 → 98 tests.

**Two findings handed to Harsha, not changed:**
- `looksBlocked` is sound — a fetch with no browser UA gets a 3,793-byte stub and
  is correctly detected; with a Chrome UA the same URL returns the real 2.6 MB page.
- `scanHtml` reports `title: "Return Instructions"` on a real Amazon page where
  `#productTitle` holds the right value. Price is correctly `no-price` there, so it
  is cosmetic for the worker — but a wrong title in a notification would confuse.
  `htmlscan.js` is his.

**Still open:**
- Awaiting **Harsha's review** on PR #3 (`shared/**` is amber). Update comment
  posted explaining the third pass.
- **Manual step, cannot be scripted:** reload Ocular at `chrome://extensions`.
  The migration runs on the next service-worker startup and will log what it
  dropped.
- The anonymous collection endpoint itself. Needs Rohith (transport) and Sumith
  (policy).
- `packages/backend` does not use `isPlausibleReading` yet. Server readings go
  through `mergeHistory` on the client so they never overwrite a browser
  observation, but the worker could still store an implausible reading of its own.
  Harsha's call.

### 2026-07-29 — orientation

Read the full repo. No code changed. Established:

- The two-track split above, and that nothing calls either one.
- `training/build_dataset.py`, `training/train_verdict.py` and `eval/metrics.py`
  are documented but absent — that is the concrete gap.
- Drafted the topology recommendation (ship weights in the extension; keep the
  service for `/extract` only). **Not yet ratified.**
- Next action: task 0, then task 2 — the synthetic generator unblocks 1, 3 and 5,
  since there is no real data to build a dataset from yet.
