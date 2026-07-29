# Contributing
The Project:
Four people, one repo. These conventions exist so nobody's afternoon is spent
resolving a merge conflict that shouldn't have happened.

Read [OWNERSHIP.md](OWNERSHIP.md) first — it says which files are yours.

## Setup

```bash
git clone https://github.com/tejaes7/Ocular.git
cd Ocular
npm install          # installs every JS workspace at once
npm test             # 72 tests, should be green before you start
npm run build        # builds the extension into ./extension
```

Python, for the AI package only:

```bash
cd packages/ai
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
pytest
```

## Loading the extension

`chrome://extensions` → **Developer mode** → **Load unpacked** → pick the
`extension/` folder at the repo root.

> Load `extension/`, **not** `packages/extension/`. Chrome derives the extension
> ID from the folder path and all stored data is keyed to it. If you load the
> wrong folder you get a second, empty copy.

Run `npm run dev` to rebuild on save. You still need to hit reload in
`chrome://extensions`, then refresh the product page — content scripts don't
reload themselves, and a stale one shows up as "the button does nothing".

## Branches

```
<name>/<what>          rohith/sync-rate-limit
                       harsha/croma-selectors
                       sumith/hero-redesign
                       sathwik/verdict-model
```

Never commit to `main` directly.

## Pull requests

- Keep them inside your own paths where possible. A PR that touches three
  packages needs three reviews and will sit for days.
- CI must be green: `npm test` and `npm run build`.
- If you changed shared code, say **which callers you checked**. There are three.
- If you changed something in `docs/API.md`, the other side has to change too —
  link that PR.

## Testing

| Package | Command | Covers |
|---|---|---|
| shared | `npm test -w @ocular/shared` | parsing, extraction, history, alerts |
| extension | `npm test -w @ocular/extension` | backup merge/validate/migrate |
| backend | `npm test -w @ocular/backend` | routing, auth, sync response shape |
| ai | `cd packages/ai && pytest` | baseline verdicts, features |

New logic in `packages/shared/` **needs a test**. It's pure by design, so
there's no excuse — no mocks, no browser, no network.

Things tests can't cover here, which need a real browser: hidden-tab checking,
notifications, idle deferral, and whether retailers actually block us. Say so in
the PR rather than implying you verified it.

## Commit messages

```
<area>: <what changed>

backend: rate-limit sync per device
shared: handle European decimal grouping
web: replace hero with real demo capture
```

## When you're unsure

The comments explain *why*, not *what* — if a decision looks strange, the reason
is usually written above it. `build.mjs`, `checker/cron.js` and
`shared/src/history.js` all have headers worth reading before you change them.

If it still looks wrong, say so. Several of these decisions are trade-offs, not
laws.
