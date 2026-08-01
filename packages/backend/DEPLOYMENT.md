# Ocular Cloudflare Backend Deployment Guide

Follow these exact steps to deploy your backend to Cloudflare Workers and Cloudflare D1.

---

### Step 1: Open Terminal & Navigate to Backend
```bash
cd packages/backend
```

### Step 2: Login to Cloudflare
```bash
npx wrangler login
```
*(This will open a browser window. Click "Allow" to log in to your Cloudflare account).*

---

### Step 3: Create the D1 Database
```bash
npx wrangler d1 create ocular
```

Look at the command output in your terminal. You will see lines like this:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ocular"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

---

### Step 4: Update `wrangler.toml`
Open `packages/backend/wrangler.toml` in your editor and copy your printed `database_id` into line 9:

```toml
database_id = "paste-your-database-id-here"
```

---

### Step 5: Apply Database Migrations (Remote D1)
Run:
```bash
npm run db:init
```
*(This creates the `devices`, `products`, `prices`, and `recovery_codes` tables on your live Cloudflare D1 database).*

---

### Step 6: Deploy Your Worker Live
Run:
```bash
npm run deploy
```

Once deployment completes, Wrangler will print your live worker URL:
`https://ocular.<your-subdomain>.workers.dev`

---

### Step 7: Verify Live Deployment
Run a curl command or open your browser to test your health endpoint:
```bash
curl https://ocular.<your-subdomain>.workers.dev/health
```

Expected JSON response:
```json
{
  "ok": true,
  "service": "ocular-sync",
  "status": "healthy",
  "db": "connected",
  "time": 1769000000000
}
```

🎉 **Congratulations! Your backend is live on Cloudflare Workers & D1!**
