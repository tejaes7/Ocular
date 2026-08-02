# API contracts

Two network boundaries. Both are **shared contracts** — changing a field name
here breaks somebody else's code. Amend this document in the same PR as the
change, and link the PR on the other side.

---

## Identity: two of them, joined in one place

Ocular carries two separate identities. Which one a request uses is decided by
the route.

| | Device UUID | Account (optional) |
|---|---|---|
| What it is | A v4 UUID the extension generates locally on first run | A Firebase uid, from signing in with Google |
| Used by | `POST /sync` | `GET /me` |
| Purpose | Carries one browser's watchlist so the worker knows what to check | Lets one person's own devices share a watchlist, and receives email alerts |
| Required? | Yes, for sync | **No.** Everything works signed out |
| Identifies a person? | No | Yes — it has an email address |

**No row that carries a price carries a user id.** That part still holds: the
`prices` table is keyed to the device UUID and nothing else.

**But the two are now joinable.** `POST /link` writes `devices.user_id`, so
`prices → device → user` is a two-hop join for anyone with database access.
Decided on 2026-08-02 to make email price alerts possible, because a drop found
while the browser is closed cannot reach the user through any channel that does
not know who they are. The decision and its cost are recorded in
`packages/backend/migrations/0003_email_alerts.sql`.

What keeps it narrow:

- The link is **opt-in** — a device that never calls `/link` is exactly as
  anonymous as before, and signed-out remains the default.
- It is **reversible** — `{"unlink": true}` clears it.
- It requires **both credentials in one call**, so neither token alone can
  create it.

**Known consequence, unresolved.** The training dataset in
`packages/ai/WORKLOG.md` was defensible precisely because its price series could
not be attributed to a person. For linked devices that is no longer true, so the
collection pipeline needs an explicit decision: either exclude linked devices
from the dataset, or strip the link at export. Nothing enforces this yet.

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
  "complete": true,              // "products" is my ENTIRE watchlist — see below
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
  "serverTime": 1769000000000,   // the server's clock — for display, NOT for syncing
  "nextSince": 1769000000000,    // send this back as "since" next time
  "truncated": false,            // true = more price rows are waiting; sync again
  "tracking": 1,
  "linked": false,               // is this device attached to an account? (see /link)
  "prices": {
    "p1a2b3": [
      { "ts": 1768950000000, "price": 4499, "inStock": true, "source": "server" }
    ]
  }
}
```

`linked` is **reported here, never changed here.** Creating the join stays
confined to `/link`, so `/sync` remains a route that sees only a device.

| Status | Code | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | Body was not JSON |
| 401 | `UNAUTHORIZED` | Missing or malformed device token |
| 404 | `NOT_FOUND` | Unknown route, or `/sync` called with the wrong method |
| 413 | `TOO_MANY_PRODUCTS` | Watchlist is over the 200-product cap. **Nothing was written or deleted.** |
| 429 | `RATE_LIMITED` | Over budget. Honour the `Retry-After` header. |

### Semantics that are easy to get wrong

- **`complete` is what licenses deletion.** The watchlist is replaced, not
  merged: anything the device stops sending stops being checked, or removing a
  product in the browser would leave the server hammering a retailer for it
  forever. But that reconciliation is only sound when the payload really is the
  whole list, so the server does it **only when `complete: true` is present.**
  Without the flag it writes what you sent and deletes nothing — the safe
  reading of a partial payload.

- **Over the cap is an error, not a truncation.** Sending 250 products used to
  save the first 200 and delete the other 50 *along with their price history*,
  because the reconcile pass could not tell "the user removed this" from "the
  server trimmed this". It now refuses the whole request and changes nothing.

- **Page prices with `nextSince`, never with `serverTime`.** A response carries
  at most 5000 price rows. When `truncated` is true, `nextSince` is the timestamp
  of the last row actually sent, and sending it back resumes exactly there.
  Advancing to `serverTime` instead — which the client used to do
  unconditionally — marks the un-sent rows as already read, and they are never
  requested again. Keep calling `/sync` while `truncated` is true to drain the
  backlog.
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
- **This route touches no price data.** `/link` is where the two identities meet;
  keep that in one place rather than spreading it across routes.

### `POST /link`

Attaches a device's watchlist to an account so the worker can email price drops
found while the browser is closed. **This is the only route that joins the two
identities** — read the identity section above before changing it.

**Creating** the link needs both credentials at once. **Removing** it needs only
the device.

```
// Link, or unlink from the website
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{ "deviceId": "3f0c1e2a-...", "unlink": false }
```

```
// Unlink from the extension, which holds no Firebase token
Authorization: Bearer <device-uuid>
Content-Type: application/json

{ "unlink": true }
```

```jsonc
// Response 200
{ "ok": true, "linked": true, "email": "shopper@example.com" }
```

The two auth modes cannot be confused: the device bearer must be a bare UUID,
and a Firebase ID token is never that shape.

| Code | Status | Meaning |
|---|---|---|
| `MISSING_AUTH_HEADER` | 401 | No `Authorization` header |
| `MALFORMED_AUTH_HEADER` | 401 | Present, but not `Bearer <token>` |
| `INVALID_TOKEN` | 401 | Firebase token failed verification |
| `BAD_REQUEST` | 400 | Body was not JSON, or `deviceId` was not a UUID |
| `NO_EMAIL` | 400 | The account has no email address to send alerts to |
| `PERSIST_FAILED` | 500 | The link could not be written |

Things that are load-bearing here:

- **Both credentials are required to create the link.** A device token alone
  cannot attach an account, and an account token alone cannot claim a device.
  Neither side can be joined on the user's behalf by a caller holding only one.
- **Removing it needs only the device token.** Detaching is a de-escalation — it
  can never create a join and discloses nothing — so requiring account access to
  undo it would strand anyone locked out of their Google account with a link
  they cannot remove. The privacy page promises this can be turned off, which
  means it has to hold in that case too.
- **Accounts with no email are rejected rather than linked.** Phone and anonymous
  sign-in mint valid tokens with no email claim; linking one produces a link that
  can never deliver anything.
- **The extension never signs in.** It opens `<site>/?pair=<deviceId>` and the
  website — already authenticated — makes this call. That avoids an OAuth client
  id, the `identity` permission, and working around Firebase's JS SDK not
  functioning inside an MV3 service worker, to duplicate auth the site already
  has. `/sync` reports `linked` back so the extension can show the real state.

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
