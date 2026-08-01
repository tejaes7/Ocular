# Ocular sync worker

Keeps checking prices while Chrome is closed. **Entirely optional** — Ocular is
fully functional without it.

## Read this first

This runs on Cloudflare's datacenter IPs. **Amazon and Flipkart will often block
it**, and no amount of header tuning changes that; the real fix is residential
proxies, which cost money and would end "free".

That's designed for, not ignored:

- The **browser is always the source of truth.** Server readings only fill gaps
  where the browser has no observation, and never overwrite one.
- Blocked hosts back off exponentially (1h → 6h → 24h → 3d) instead of hammering.
- Where it genuinely earns its keep is **smaller retailers with clean JSON-LD** —
  which is a large share of the long tail.

If you only track Amazon and Flipkart, skip this entirely and rely on the
extension's hidden-tab checking.

## Deploy

```bash
cd worker
npm install -g wrangler        # if you don't have it
wrangler login

# 1. Create the database, then paste the printed database_id into wrangler.toml
wrangler d1 create ocular

# 2. Apply the schema
wrangler d1 execute ocular --file=./schema.sql --remote

# 3. Ship it
wrangler deploy
```

Then in the extension's options page, enable **Background sync** and paste the
worker URL (`https://ocular.<your-subdomain>.workers.dev`).

## Free tier

| Resource | Free allowance | What Ocular uses |
|---|---|---|
| Worker requests | 100,000/day | ~48 cron runs/day + one sync per browser start |
| Cron triggers | Unlimited | Every 30 min |
| D1 storage | 5 GB | A few KB per tracked product |
| D1 rows read | 5M/day | Well under, given the `idx_products_due` index |

Comfortably inside the free tier for personal use.

## API

Auth on `/sync` is a `Bearer` token that is just the extension's locally
generated UUID — no email, and nothing that identifies a person.

Accounts are optional and separate. `/me` takes a Firebase ID token and is the
only route that knows who you are; `/sync` never consults it. **No row that
carries a price may carry a user id** — see `docs/API.md`.

### `GET /health`
```json
{ "ok": true, "service": "ocular-sync", "time": 1769000000000 }
```

### `POST /sync`
```jsonc
// Request
{
  "since": 1768900000000,          // only send prices newer than this
  "products": [
    { "id": "p1a2b3", "url": "...", "canonicalUrl": "...", "title": "...", "currency": "INR" }
  ]
}

// Response
{
  "ok": true,
  "serverTime": 1769000000000,
  "tracking": 2,
  "prices": { "p1a2b3": [{ "ts": 1768950000000, "price": 4499, "inStock": true }] }
}
```

The watchlist is **replaced** on every sync, so removing a product in the browser
stops the server checking it too.

## Design notes

- **No DOM in Workers**, so the server uses only the rungs that survive on raw
  text: JSON-LD and meta tags (`src/lib/htmlscan.js`, shared with the extension).
  Selector packs and the visual heuristic stay browser-only.
- **Honest User-Agent.** Impersonating Chrome doesn't defeat modern
  fingerprinting and makes the traffic look worse under scrutiny, not better.
- **Per-host cron caps** (4 per run) so one large watchlist can't concentrate
  traffic on a single retailer.

## Cost of running it badly

Don't raise `MAX_CHECKS_PER_CRON` or shorten the cron to "get fresher prices".
The bottleneck is never Cloudflare — it's how fast a retailer decides your worker
is a bot. Slower is strictly better here.
