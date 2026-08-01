# AI worklog — Sathwik

Running context for the AI track. **Write an entry at the end of every working
session**, newest at the *top* of the session log so the current state is the
first thing you read. It exists so a new session (human or assistant) can be
brought fully up to speed by reading this one file.

Each entry carries its own "Still open" list. Only the newest one is current —
earlier lists are a record of what was open then, not a to-do.

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

**Gap 2 — collect the data. Do not invent it.** An earlier draft of this section
said to write a generator that produces five shapes of fake history (flat, slow
decline, seasonal dip, fake sale, noisy). **That was rejected on 2026-07-29 and
the decision stands:** ship the deterministic pipeline, run it for 5–6 months,
collect real histories, then train. A model trained on invented series learns the
generator's assumptions about what a fake sale looks like, and the whole point is
that we do not yet know.

The consequence is that **extraction and storage quality is the AI work** until
there is data. That is where the last three sessions went, and correctly so.

**Features are already written.** `features.py` turns one price history into 14
numbers. Call it; don't rewrite it. (Rewriting it is how you get a model that
scores well in testing and behaves badly for real users — the numbers it trains
on stop matching the numbers it sees live.)

**First thing to build:** nothing, yet. Task 1 (`build_dataset.py`) can be
written and tested against own exports today; everything past it waits on real
collected histories.

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
| 2 | ~~Synthetic series generator~~ | **void** — killed by the 2026-07-29 no-synthetic-data decision. Left in the table so it is not proposed a third time |
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

### 2026-08-01 — accounts shipped against the ratified decision; split identity ratified instead

**Firebase Authentication landed on `main` while nobody was looking at the
anonymity decision.** PR #11 (Rohith, merged 07:31Z) added real Firebase ID-token
verification, a `users` table holding email / display name / photo URL, and
`GET /me`. PR #13 (Sumith, merged 10:54Z) replaced the whole web UI with a React
+ Vite + Tailwind app carrying a sign-in modal. PR #12 is open as a
frontend-integration reference, explicitly not for merge.

That contradicts the 2026-07-29 entry directly, which recorded the Google-auth
proposal as **rejected** — "OAuth supplies identity, which this dataset
specifically must not have." Seven files still said "no accounts", including
`privacy.html`, which is a **published legal document** and the URL the Chrome
Web Store listing depends on.

**Ratified: split identity.** Not a reversal and not a revert. Two identities
that are never joined — `/sync` authenticates with the anonymous device UUID and
is the only route touching price data; `/me` authenticates with a Firebase token
and is the only route that knows a name. Accounts are optional and buy exactly
one thing: a watchlist that follows you between your own browsers.

The invariant is now written down rather than assumed: **no row that carries a
price may carry a user id.** It sits in `docs/API.md` with pointers from
`0002_users.sql` and `deviceIdFrom()` — the two places someone would actually be
standing when they consider adding one. That is what keeps the collection plan
defensible; it should cost a team decision, not a migration.

**PR #14 — four defects in the `/me` path, all invisible until a real login.**

| Defect | Why nobody saw it |
|---|---|
| Migration 0002 applied by **nothing** — `db:init` named `0001_init.sql` explicitly, and the README's step 2 pointed at a `schema.sql` that does not exist | Backend has never been deployed. First `/me` call → `no such table: users` |
| `email TEXT NOT NULL UNIQUE` | Phone/anonymous sign-in has no email claim → NOT NULL violation. Google-then-password gives two uids on one address → UNIQUE violation, permanent lockout |
| `FIREBASE_PROJECT_ID` fell back to a hardcoded id | Set nowhere in the repo, so the fallback was *always* what ran. A wrong project keeps accepting tokens and looks healthy |
| check-then-insert: race on concurrent first login, and `{ ok: true, user: null }` when the re-SELECT came back empty | A 200 carrying no user; client throws on `body.user.uid` |

Fixed with `wrangler d1 migrations apply` (so adding a file is the whole
procedure), `firebase_uid` as the sole identity key, a loud throw on missing
config, and an upsert with `RETURNING`. Also: the `Bearer` scheme is now
*required* — the Headers API trims values, so `Authorization: Bearer` arrived as
`Bearer` and the old prefix-strip handed the literal scheme name to the verifier
as a credential.

13 tests, asserting on **what reached the database** via a recording D1 stub.
Each one was confirmed to fail with its fix reverted. Backend 28 → 41.

**PR #15 — the docs, plus two things #13 broke silently.** `privacy.html` linked
`public/styles.css`, which the Vite migration deleted, so the policy has been
rendering unstyled with nothing reporting it — styles are now inlined, because a
legal page should not carry a build dependency it can lose. And `Footer.jsx`
replaced the link to it with a **modal containing its own two-sentence privacy
text** that said different things. A modal also has no URL, which is the one
thing the Web Store requires. Both fixed; `/me` documented.

**The PR #8 lesson recurred in three days, which makes it structural.** #11
merged with backend CI green at 28/28, every one of those tests over a pure
helper, none touching `createUser` — whose only observable effect is a write.
That is verbatim what #8 taught on 2026-07-30. Twice now the PR was on its
author's own CODEOWNERS path, so CI was the only gate, and **CI cannot see a
missing write.** The process question raised last entry is no longer
hypothetical: it has now cost us two incidents. Worth deciding.

**Fifth and sixth instances of the standing silent-failure shape** (after
`firstMatch`, the CODEOWNERS handle, and the dropped `recordSuccess`): a
migration nothing applies, and a config default that hides its own absence. The
hypothesis holds — *a failure that is indistinguishable from success at the point
where you would notice.* Both were found by asking "what applies this?" and "what
sets this?" rather than by reading the code, which is the technique that keeps
working.

**New gap found: CI never builds `packages/web`.** Root `npm run build` is
`-w @ocular/extension`. #13 added ~6,400 lines of React that CI does not compile,
so a broken component merges green. Verified my own edit with esbuild across all
23 components instead. Flagged in #15, not folded in.

**Reviewed PR #12** — reference code gets copied verbatim, so it was worth
reading closely. `login.jsx` does `console.log("Firebase Token:", token)`, which
prints a live one-hour bearer credential; `api.js` hardcodes
`http://127.0.0.1:8787` (wrong host *and* blocked as mixed content from an HTTPS
page) and returns `response.json()` without checking `ok`, so a 401 reads as
success. No token refresh, so tabs 401 after an hour. Noted explicitly that the
committed `firebaseConfig` is **fine** — it is public by design — so nobody
"fixes" it later; but its `measurementId` is a Google Analytics stream sitting
one import away from live, and the privacy policy says no analytics.

**Still open:**
- **PRs #14 and #15 need review.** Both green. #14 is Rohith's path; #15 touches
  Sumith's (`privacy.html`, `Footer.jsx`) and Rohith's. **Merge #14 first** — #15
  documents `/me` as #14 leaves it.
- **The AI track has not moved.** Tasks 0–7 are all still open; this session went
  entirely on the accounts collision. That was the right call — the invariant
  protects the dataset the whole plan depends on — but it is the second session
  in a row spent on data quality rather than modelling.
- **Manual step, cannot be scripted:** reload Ocular at `chrome://extensions`.
  The v3 migration runs on the next service-worker startup and logs what it
  dropped. Still not done, still the only way to confirm `repairHistory` behaves
  on the real profile rather than on the export. Now the longest-running open item.
- **Decide whether checker/backend changes need a non-owner reviewer.** Two
  incidents now.
- **Wire `packages/web` into CI.** Nobody owns this yet.
- Handed to Harsha, unchanged: `checker/cron.js` stores `result.price` with no
  `isPlausibleReading` gate; `scanHtml` Amazon title.
- Handed to Rohith: deploy the backend. **Do not deploy before #14 merges** — the
  users table does not exist in any environment until the migration runner lands.
- The anonymous collection endpoint, now unblocked on policy: `privacy.html` in
  #15 states the account/price separation, so the remaining work is transport.

### 2026-07-30 — PR #7 merged with the checker's success path deleted; restored in PR #8

**Resolved same day — PR #8 merged (`ae482dd`), `main` collects again.** Stale-head
check run on that merge and it was clean: second parent is the branch tip and
`origin/main..branch` is empty. What follows is the record of what went wrong.

**`main` was collecting nothing for ~40 minutes.** PR #7 (`e6926c7`, Harsha) rewrote
`checkOne`'s failure branch in `checker/cron.js` and lost the success branch with
it. `recordSuccess` survived only as an unused import on line 18 — nothing called
it. It is the only writer of the `prices` table and the only thing that resets
`fail_count` and advances `last_checked_at`, so a successful check stored no
price, and `last_checked_at` never moved — which means `dueProducts` would keep
returning the same rows and the cron would refetch them every tick, forever.
Silent total data loss on the collection run, plus that refetch loop is precisely
how a retailer decides to block the worker.

**PR #8** (`fix/checker-success-path`, `67da2fd`) restored the call. It keeps
everything worth keeping from #7: `failureReasonFromResponse`, the
structured `[Checker]` logging, currency normalisation, the repeated-slash
collapse in `canonicalizeUrl`, and Harsha's `node --test` auto-discovery fix —
which is a better fix than routing the glob through `sh`, and is now the script
in both packages. Also folded in: `decodeHtmlEntities` decoded `&amp;` first, so
an escaped `&amp;lt;` became `<` instead of `&lt;` (moved last); the `scanHtml`
JSDoc block had been left documenting `normalizeCurrency`, which was inserted
between the comment and its function; 25 unrelated `"peer": true` markers
stripped from `package-lock.json`, reverted.

**Green CI merged a broken write path, and that is the lesson.** #7 added 26
backend tests and reported 75/75 passing. All of them cover pure helpers —
`failureReasonFromResponse`, `backoffFor`, `selectBatch`. None touch the write
path, so none could fail. #8 adds two `checkOne` tests over a recording D1 stub
that assert on *what was written* rather than on the return value (`checkOne`
returns nothing); verified they fail with the `recordSuccess` call removed.
**A function whose only observable effect is a write needs a test that inspects
the write.** Passing tests next to an untested effect read as coverage and are
not.

**Third silent-failure bug in three days, same shape.** `firstMatch` skipping
absent-but-not-failing selectors; a CODEOWNERS handle that resolves but lacks
write access; now a dropped write in a function that returns nothing either way.
All three are **a failure that is indistinguishable from success at the point
where you would notice.** The previous entry called this shape worth suspecting
directly — it recurred within a day, so it is the standing first hypothesis on
this repo, not an observation.

**New staleness variant, related to the #3 dropped-commit failure.** #7 was
branched from a fork point predating PRs #3–#6 and validated there, so its
"49/49 shared tests passing" was measured on a tree missing 26 shared test files
— that suite is 75 on `main`. The existing habit checks the *merge* for a stale
head; this one needs checking at the *branch* end. **Rebase before quoting a test
count**, otherwise the number describes a tree nobody is merging.

**Still open:**
- **Manual step, cannot be scripted:** reload Ocular at `chrome://extensions`.
  The v3 migration runs on the next service-worker startup and logs what it
  dropped. Still not done, still the only way to confirm `repairHistory` behaves
  on the real profile rather than on the export.
- Handed to Harsha, still his and unchanged by #8: `checker/cron.js` stores
  `result.price` with **no `isPlausibleReading` gate**. #8 restores the call
  exactly as it was and deliberately does not add the gate — that is a
  behavioural decision on his path, not a regression fix. His `scanHtml` Amazon
  title issue is partly addressed by the entity decoding in #7, not confirmed
  fixed.
- Handed to Rohith: deploy the backend. Unblocked again now that #8 has merged —
  but note it was unsafe to deploy for the window `e6926c7..ae482dd`, and the
  general point stands: **check that the checker's write path is intact before
  deploying**, because the failure mode is invisible from the outside.
- Handed to Sumith, unchanged: **`privacy.html` contradicts the ratified
  collection plan.** It states "No prices, settings, or browsing history beyond
  those product URLs are sent"; anonymous collection sends exactly that. The page
  changes *before* collection ships. Amber, so it returns here for review.
- The collection endpoint itself, once the policy is right.
- **Process question raised by this near-miss, for the team:**
  `packages/backend/src/checker/` is Harsha's own CODEOWNERS path, so his PR had
  no reviewer with a stake in the file and CI was the only gate. A gate that
  cannot see a missing write is not a gate. Worth deciding whether checker
  changes need a non-owner reviewer.

### 2026-07-30 — PR #4 and #5 merged; all four CODEOWNERS handles now real

**PR #4 merged** (`17a4186`). The `fromSelectors` fix is finally on `main` — rung 4
works on every site again. Stale-head check run on this merge and it was clean:
second parent `06258dd` *is* the branch tip and `origin/main..branch` is empty. The
check is worth keeping as a habit, not a one-off; it is the only thing that catches
the #3 failure.

**PR #5 merged** (`62a8104`) — `@rohith` → `@rohithkrishna070`, `@sumith` →
`@sumithraj207`. All four handles now resolve *and* hold write access, so review
requests actually route. `packages/backend/**` and `packages/web/**` had no
effective reviewer at all before this.

**The handle I was given was wrong, and it would have failed silently.**
`@sumithraj20` returns 404; the real account is `@sumithraj207`. Committing the
first one would have reproduced the exact bug being fixed — `packages/web` still
unguarded, nothing anywhere reporting it. Caught by cross-checking
`gh api repos/tejaes7/Ocular/collaborators`, which is the authoritative source
here: **a CODEOWNERS entry only works if the handle resolves *and* has write
access on the repo.** Verifying resolution alone is not sufficient. The check is
now documented in the CODEOWNERS header.

Generalisation worth carrying: this is the second silent-failure bug in two days
(the first being `firstMatch` skipping absent but not failing selectors). Both
share a shape — **a lookup that returns nothing on failure, in a position where
nothing is indistinguishable from fine.** Worth suspecting that shape directly.

**Still open:**
- **Manual step, cannot be scripted:** reload Ocular at `chrome://extensions`.
  The v3 migration runs on the next service-worker startup and logs what it
  dropped. Still not done — and it is the only way to confirm `repairHistory`
  behaves on the real profile rather than on the export. This is now the sole
  item on the critical path.
- Handed to Harsha, unchanged: `scanHtml` wrong title on Amazon (`htmlscan.js`),
  and `checker/cron.js:99` storing `result.price` with no `isPlausibleReading`
  gate. Neither is urgent; both are his paths.
- Handed to Rohith: deploy the backend (`OWNERSHIP.md` calls it the
  highest-value task in the repo; nothing there has run against real Cloudflare).
  Blocks Harsha's per-host block-rate measurement.
- Handed to Sumith: **`privacy.html` contradicts the ratified collection plan.**
  It states "No prices, settings, or browsing history beyond those product URLs
  are sent" — anonymous collection sends exactly that. The page changes *before*
  collection ships, not after. Amber, so it comes back here for review.
- The collection endpoint itself, once the policy is right.

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

**Still open at the time of writing** (superseded by the entry above — #4 merged):
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
