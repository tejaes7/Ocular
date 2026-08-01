# API contracts

Two network boundaries. Both are **shared contracts** — changing a field name
here breaks somebody else's code. Amend this document in the same PR as the
change, and link the PR on the other side.

---

## Identity: two of them, never joined

Ocular carries two separate identities. Which one a request uses is decided by
the route, and **nothing may correlate them**.

| | Device UUID | Account (optional) |
|---|---|---|
| What it is | A v4 UUID the extension generates locally on first run | A Firebase uid, from signing in with Google |
| Used by | `POST /sync` | `GET /me` |
| Purpose | Carries one browser's watchlist so the worker knows what to check | Lets one person's own devices share a watchlist |
| Required? | Yes, for sync | **No.** Everything works signed out |
| Identifies a person? | No | Yes — it has an email address |

**The invariant: no row that carries a price may carry a user id.** Price data is
keyed to the anonymous device UUID and to nothing else. An account may point at
its devices; a device may never point back at a price row through an account.

This is not a stylistic preference. The training dataset described in
`packages/ai/WORKLOG.md` is only defensible because the price series in it cannot
be attributed to a person. Adding `user_id` to a price table is the single change
that would break that, and it needs a decision from the whole team rather than a
migration — see the header of `packages/backend/migrations/0002_users.sql`.

Signing in buys exactly one thing today: your watchlist follows you between your
own browsers. It does not unlock features, it is not required, and it does not
change what is stored about a product.

---

## 1. Sync API — extension ↔ backend

Implemented by `packages/backend`. Called by
`packages/extension/src/lib/sync.js`.

**Owner: Rohith.** Reviewer: Sathwik.

### Auth

```
Authorization: Bearer <device-uuid>
```

The token *is* the identity — a UUID the extension generates locally on first
use. No email and no password are involved, and this route never consults an
account even when one exists.

It must match `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`
case-insensitively. **Do not loosen this.** The strict shape is the security
boundary: accepting arbitrary strings would let anyone guess or choose another
device's key and read its watchlist.

### Error envelope

Every failing route returns the same shape:

```json
{ "ok": false, "error": "Missing or malformed device token", "code": "UNAUTHORIZED" }
```

**`code` is the contract; `error` is display text.** Clients branch on `code`, so
reword `error` freely and never rename a code — a caller checking
`code === 'UNAUTHORIZED'` simply stops matching and silently falls into its
generic branch.

| Code | Status | Meaning |
|---|---|---|
| `BAD_REQUEST` | 400 | Body was not JSON |
| `UNAUTHORIZED` | 401 | Missing or malformed device token |
| `MISSING_AUTH_HEADER` | 401 | No `Authorization` header on `/me` |
| `MALFORMED_AUTH_HEADER` | 401 | Present, but not `Bearer <token>` |
| `INVALID_TOKEN` | 401 | Firebase token failed verification |
| `NOT_FOUND` | 404 | Unknown route, or right path with the wrong method |
| `PERSIST_FAILED` | 500 | The account could not be written |

### `GET /health`

```json
{ "ok": true, "service": "ocular-sync", "status": "healthy", "db": "connected", "time": 1769000000000 }
```

**Returns 503 with `status: "degraded"` and `db: "unavailable"` when D1 cannot be
reached.** It queries the database rather than just returning a literal, because
the failure worth detecting is not "is the script running" — Cloudflare already
5xxs for that — but a wrong `database_id` or an unapplied migration, which leaves
the worker up and every other route 500ing. Use this as the uptime probe.

### `POST /sync`

```jsonc
// Request
{
  "since": 1768900000000,        // only return prices newer than this
  "products": [
    {
      "id": "p1a2b3",            // stable hash of canonicalUrl
      "url": "https://www.amazon.in/dp/B01",
      "canonicalUrl": "https://www.amazon.in/dp/B01",
      "title": "Sony WH-1000XM5",
      "currency": "INR"
    }
  ]
}
```

```jsonc
// Response 200
{
  "ok": true,
  "serverTime": 1769000000000,
  "tracking": 1,
  "prices": {
    "p1a2b3": [
      { "ts": 1768950000000, "price": 4499, "inStock": true, "source": "server" }
    ]
  }
}
```

| Status | Meaning |
|---|---|
| 400 | Body was not JSON |
| 401 | Missing or malformed device token |
| 404 | Unknown route, or `/sync` called with the wrong method |

### Semantics that are easy to get wrong

- **The watchlist is replaced, not merged.** Anything the device stops sending
  stops being checked. Otherwise removing a product in the browser would leave
  the server hammering a retailer for it forever.
- **Never send prices upward.** The extension pushes only what the server needs
  to fetch a page. Price history stays on the device.
- **Server prices are advisory.** The extension merges them via `mergeHistory()`
  and they never overwrite a browser observation.
- **Idempotent.** Calling repeatedly is safe; the worst case is redundant writes.
- Cap: 200 products per device, 5000 price rows per response.

### `GET /me`

Resolves a Firebase ID token to an account, creating it on first sign-in. This is
the **only** route that uses the account identity — see the identity table above.

```
Authorization: Bearer <firebase-id-token>
```

The scheme is required: a bare token, or `Bearer` with nothing after it, is a
401. Verification is against Google's public JWKS, checking signature, `exp`,
`iss`, `aud` and a non-empty `sub`. The worker refuses to verify at all unless
`FIREBASE_PROJECT_ID` is set — there is deliberately no default.

```jsonc
// Response 200
{
  "ok": true,
  "isNew": false,                       // true only if this call created the account
  "user": {
    "uid": "firebase-uid-abc123",       // the only identity key
    "email": "shopper@example.com",     // may be null
    "displayName": "A Shopper",         // may be null
    "photoURL": "https://..."           // may be null
  }
}
```

**There is no separate register endpoint, and there must not be one.** Google
sign-in either matches an existing account or mints one, and the client cannot
know which applies before calling. The website used to offer "Login" and
"Register" tabs whose buttons called the identical function, so a returning
visitor could pick Register and a new one could pick Login — and the label lied
either way. `isNew` reports what actually happened, so the UI greets the visitor
after the fact instead of asking them to predict it.

See the error-envelope table above for `/me`'s failure codes.

Things that are load-bearing here:

- **`uid` is the only identity key.** `email` is nullable *and* non-unique, both
  on purpose. Phone and anonymous sign-in produce a valid token with no email
  claim; and one person signing in with Google and later with a password gets two
  uids on one address. Keying on the address turns either case into a permanent
  lockout.
- **First sign-in and every later one take the same path** — an upsert, not
  check-then-insert. Two concurrent first sign-ins would otherwise race and one
  would fail on the unique uid.
- **Never returns `{ ok: true }` with a null user.** A write that did not produce
  a row is a 500. Clients may rely on `user.uid` existing whenever `ok` is true.
- **This route touches no price data**, and adding a field here that links it to
  any is the change the identity section forbids.

---

## 2. AI service — extension/backend → AI

Implemented by `packages/ai`. Client shape mirrored in
`packages/extension/src/lib/ai.js`.

**Owner: Sathwik.**

> The service **must always answer**. If a model is missing, failing or slow,
> fall back to the deterministic baseline. Callers treat a 5xx as "AI is broken"
> and hide the feature, which is worse for the user than a blunter verdict.

### `GET /health`

```json
{ "ok": true, "service": "ocular-ai", "model": "baseline-v1" }
```

### `POST /verdict`

Is this a good price right now?

```jsonc
// Request
{
  "history": [
    { "ts": 1768000000000, "price": 10000, "inStock": true }
  ],
  "currency": "INR",
  "title": "Sony WH-1000XM5"
}
```

```jsonc
// Response 200
{
  "verdict": "buy_now",          // "buy_now" | "wait" | "neutral"
  "confidence": "high",          // "low" | "medium" | "high"
  "reasoning": "About 15% below its usual price.",
  "fairPrice": 10000,
  "model": "baseline-v1"
}
```

`confidence` reflects **how much history exists**, not how strong the signal
looks. Three readings over two days cannot support a confident claim however
clean the pattern.

### `POST /extract`

Last-resort price extraction. Currently returns **501** — not implemented.

```jsonc
// Request
{
  "snippet": "TITLE: ...\n\nPRICE CANDIDATES:\ndiv.price :: ₹4,499\n...",
  "url": "https://shop.example.com/p/123"
}
```

```jsonc
// Response 200
{
  "price": 4499,
  "currency": "INR",
  "inStock": true,
  "selector": "div.price",       // cached per hostname by the extension
  "confidence": "high",
  "model": "extract-v1"
}
```

Two things that matter more than they look:

- **Send a trimmed snippet, never raw HTML.** Use `buildPriceSnippet()` from
  `@ocular/shared/extract`. A product page is ~2 MB; the snippet is ~2 KB, and
  the trimmed version gives *better* answers as well as cheaper ones.
- **Return the selector.** The extension caches it per hostname, so a new site
  costs one inference *ever*, not one per check. Without it, this endpoint is
  too expensive to use.

This path is reached only when all four deterministic rungs in
`shared/src/extract.js` have missed, which is rare. Lower priority than
`/verdict`.
