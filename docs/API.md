# API contracts

Two network boundaries. Both are **shared contracts** — changing a field name
here breaks somebody else's code. Amend this document in the same PR as the
change, and link the PR on the other side.

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
use. There are no accounts, no email, no password.

It must match `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`
case-insensitively. **Do not loosen this.** The strict shape is the security
boundary: accepting arbitrary strings would let anyone guess or choose another
device's key and read its watchlist.

### `GET /health`

```json
{
  "ok": true,
  "service": "ocular-sync",
  "status": "healthy",
  "db": "connected",
  "time": 1769000000000
}
```

Returns `HTTP 503 Service Unavailable` with `status: "degraded"` and `db: "disconnected"` if D1 connectivity fails.

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

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_BODY` / `VALIDATION_ERROR` | Body is not valid JSON object or fails payload constraints |
| 401 | `UNAUTHORIZED` | Missing or malformed device token |
| 404 | `NOT_FOUND` | Unknown route, or `/sync` called with non-POST method |
| 429 | `TOO_MANY_REQUESTS` | Exceeded 60 requests / minute rate limit (includes `Retry-After`) |
| 500 | `INTERNAL_SERVER_ERROR` | Uncaught server exception |

### `POST /recovery/generate`

Generates an anonymous 6-character recovery code for device watchlist recovery.

```jsonc
// Response 200
{
  "ok": true,
  "code": "X7K9B2",
  "expiresAt": 1776777600000
}
```

Rate limit: 5 requests per 10 minutes.

### `POST /recovery/claim`

Claims a 6-character recovery code and transfers the associated watchlist to the caller's device UUID.

```jsonc
// Request
{
  "code": "X7K9B2"
}

// Response 200
{
  "ok": true,
  "message": "Watchlist transferred successfully"
}
```

Rate limit: 5 requests per 10 minutes (prevents brute-force guessing).

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
