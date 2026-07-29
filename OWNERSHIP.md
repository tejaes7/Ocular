# Who owns what to do

The repo is split so four people can work at once without editing the same
files. **Find your name, work inside your paths, open a PR for anything else.**

| Person | Role | Owns |
|---|---|---|
| **Sathwik** | AI model engineer | `packages/ai/`, `packages/extension/` |
| **Rohith** | Backend — API, storage, deploy | `packages/backend/src/routes/`, `src/db/`, `src/lib/`, `migrations/`, `wrangler.toml` |
| **Harsha** | Backend — checking & retailer coverage | `packages/backend/src/checker/`, plus `sites.js` + `htmlscan.js` in shared |
| **Sumith** | Landing page & site | `packages/web/` |

---

## The three rules

1. **Green means yours — edit freely, no permission needed.**
2. **Amber means shared — you may edit, but the PR needs one review** from the
   person listed. These files have callers you can't see from where you sit.
3. **Never edit another person's green paths.** Open an issue or ask them.

`.github/CODEOWNERS` enforces this automatically: GitHub requests the right
reviewer the moment you touch an amber or foreign path.

---

## Sathwik — AI + extension

### Green
```
packages/ai/**                    the models, training, eval, serving
packages/extension/src/**         the whole extension
packages/extension/build.mjs
docs/PLAN.md
```

### Amber
```
packages/shared/**                → ping Harsha if you touch extraction
docs/API.md                       → affects Rohith and Harsha
```

### What's next
- Train the deal-verdict model (`packages/ai/README.md` has the framing and the
  free-labelling trick). The deterministic baseline already ships and answers,
  so nothing is blocked on you.
- The model must beat `baseline.py` on the eval set before it replaces it.
- Decide where the AI service is deployed, and keep the extension working when
  it is unreachable.

---

## Rohith — backend API, storage, auth, deploy

### Green
```
packages/backend/src/index.js     the router
packages/backend/src/routes/**
packages/backend/src/db/**
packages/backend/src/lib/**
packages/backend/migrations/**
packages/backend/wrangler.toml
packages/backend/test/**
```

### Amber
```
docs/API.md                       → the extension implements this; Sathwik reviews
packages/extension/src/lib/sync.js   → the client for your API; Sathwik reviews
```

### What's next
1. **Deploy it.** Nothing here has ever run against real Cloudflare —
   `packages/backend/README.md` has the steps. This is the single highest-value
   task in the repo.
2. Recovery code flow, so a device ID survives a reinstall (see the note in
   `docs/ARCHITECTURE.md` — we are *not* building accounts).
3. Rate limiting per device, and something that alerts when the cron stops.

### Don't
- Don't loosen the UUID check in `src/lib/http.js`. The token *is* the identity;
  accepting arbitrary strings would let anyone read anyone's watchlist.
- Don't change the `products` table without telling Harsha — the cron reads it.

---

## Harsha — checking pipeline & retailer coverage

### Green
```
packages/backend/src/checker/**   cron scheduling, fetching, backoff
```

### Amber
```
packages/shared/src/sites.js      → you are the primary author; Sathwik reviews
packages/shared/src/htmlscan.js   → same
packages/shared/src/extract.js    → the extension depends on this heavily
```

### What's next
1. Widen retailer coverage in `sites.js`. Prefer sites with clean JSON-LD —
   those work server-side too, where the big retailers won't.
2. Measure the block rate per host once Rohith has deployed, and tune the
   backoff from real numbers rather than guesses.
3. Add tests for `selectBatch` and `backoffFor` — both are pure and currently
   untested.

### Don't
- **Don't raise `MAX_CHECKS_PER_CRON` or shorten the cron to get fresher
  prices.** The bottleneck is never Cloudflare; it is how fast a retailer decides
  we're a bot. Getting blocked means *no* prices. Slower is strictly better.
- Don't add a fake Chrome User-Agent. It does not defeat modern fingerprinting,
  and an honest UA is what gets you unblocked when you ask.

---

## Sumith — landing page & site

### Green
```
packages/web/**
```

### Amber
```
packages/web/public/privacy.html  → the claims must match what the code does;
                                     Sathwik reviews before it goes live
```

### What's next
1. Replace the skeleton with a real design. It exists for structure and copy,
   not for looks.
2. Capture the demo — see the asset table in `packages/web/README.md`. A 20-second
   loop sells this better than any amount of text.
3. **The privacy page is a blocker for Chrome Web Store submission.** The listing
   is rejected without a reachable privacy policy URL.

### Notes
- `public/styles.css` mirrors the extension's tokens. Keeping the site and the
  product visually consistent is worth more than a novel landing-page look.
- The palette is monochrome on purpose: colour means "price down" or "price up"
  and nothing else. Please keep that.

---

## Shared code — `packages/shared/`

Pure logic that must give **identical answers** in the extension, the backend and
the AI service. If these ever disagree, the product lies to the user.

| File | Primary | Why it's shared |
|---|---|---|
| `extract.js` | Sathwik | Extraction ladder + price parsing |
| `sites.js` | Harsha | URL canonicalisation — the product identity function |
| `htmlscan.js` | Harsha | DOM-free extraction for the worker |
| `history.js` | Sathwik | `median90` anchors every alert rule *and* AI feature |
| `alerts.js` | Sathwik | Alert rules |
| `format.js` | Sathwik | Money/time formatting |

Rules for this package:

- **No platform APIs.** No `chrome.*`, no `document` at module scope, no storage,
  no `fetch`. Everything is a pure function or takes what it needs as an argument.
- **Every change needs a test.** `npm test -w @ocular/shared`.
- **Every PR needs a review.** You cannot see all the callers from your package.

---

## Two things nobody may change without discussion

**1. The extension build output path.**
`packages/extension/build.mjs` writes to `<repo root>/extension/`. Chrome derives
an unpacked extension's ID from its folder path, and all user data is keyed to
that ID. Moving it silently wipes every user's tracked products and price
history. The header comment in `build.mjs` explains the whole thing.

**2. The browser is the source of truth.**
Server-side readings only fill gaps; they never overwrite a browser observation.
The worker runs on a datacenter IP and is the side more likely to be served a
stale page, a regional price, or an anti-bot placeholder. See
`docs/ARCHITECTURE.md`.
