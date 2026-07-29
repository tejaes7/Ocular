# @ocular/ai

**Owner: Sathwik.** Nobody else edits this package without asking.

Two models, one HTTP service. The extension and the backend call it over the
contract in [`docs/API.md`](../../docs/API.md) — they never import from here.

## The design decision that matters

**A deterministic baseline ships first and always answers.** `baseline.py`
satisfies the full API contract today, using rules over price history. That
means Rohith, Harsha and Sumith can integrate against a live service **before a
single model is trained**, and it means a model outage degrades to "slightly
worse answers" instead of "feature is down".

Train the model to *beat the baseline*, and keep the baseline as the fallback.
`eval/` exists to prove the model actually does beat it — an AI feature that
scores worse than twenty lines of rules is not worth deploying.

## The two jobs

### 1. Deal verdict — `POST /verdict`

Given a price history, decide **buy now / wait / neutral**.

This is the real ML problem, and it's genuinely hard for rules alone:

- A "discount" off an inflated M.R.P. is not a discount.
- Prices raised shortly before a sale event and then "cut" are fake drops —
  rampant during Indian sale events.
- Seasonality: some categories reliably drop at predictable times.

Features live in `features.py` and are computed from the raw series, so the same
vector is available at training and serving time.

**Suggested framing:** binary classification — *will this product be available
at least X% cheaper within the next N days?* That gives you labels you can
generate automatically from historical series, with no human annotation.

### 2. Price extraction fallback — `POST /extract`

Given a **trimmed** DOM snippet (never raw HTML — see `buildPriceSnippet()` in
`@ocular/shared/extract`), return the selling price plus the CSS selector it came
from.

The extension caches that selector per hostname, so a site costs **one inference
ever, not one per check**. Latency matters less than you'd think; accuracy and
selector stability matter enormously.

This is reached only when all four deterministic rungs miss, which is rare — so
treat it as the lower-priority model.

## Layout

```
src/ocular_ai/
  service.py     FastAPI app — /health, /verdict, /extract
  schemas.py     request/response models (must match docs/API.md)
  features.py    price series -> feature vector (training + serving)
  baseline.py    deterministic fallback; always answers
training/
  build_dataset.py   exported histories -> labelled training rows
  train_verdict.py   train + persist the verdict model
eval/
  metrics.py     must compare against baseline, not just report accuracy
data/            gitignored — never commit user data
```

## Getting data

The extension already exports full price histories as JSON
(`packages/extension/src/lib/backup.js`). That format is your training input —
see `training/build_dataset.py`.

**Do not put real user data in `data/`.** It is gitignored for a reason. Use your
own exports and synthetic series until there is an explicit, opt-in collection
flow with a privacy policy behind it.

## Run it

```bash
cd packages/ai
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

uvicorn ocular_ai.service:app --reload --port 8000
curl localhost:8000/health
```

## Deploying

Not decided yet — pick when there's a model worth serving. Options, roughly in
order of least-effort:

| Option | Notes |
|---|---|
| Cloudflare Workers AI | Same account as the backend, cheap, limited model choice |
| Vercel Python Functions | Easy deploys, good cold starts on Fluid Compute |
| Fly.io / Railway | Full control, always-on, costs money |

Whatever you choose, the extension must keep working when it is unreachable.
That is what the baseline is for.
