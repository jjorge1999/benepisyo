# Benepisyo

A free, Tagalog-first web app that shows Filipinos every government benefit they qualify for, national and local, with exact amounts, what to bring, where to go, and the source and date behind every item. Pilot city: Calamba, Laguna.

## What's in this repo

| Folder | What it is |
| --- | --- |
| `data/` | The content: `benefits.json` (17 benefits), `offices.json`, `meta.json` (cities, groups, documents) |
| `site/` | Public site: a zero-dependency static generator (`src/build.js`) that writes one indexable page per benefit, plus the installable offline web app (`src/app.js`) |
| `worker/` | Cloudflare Worker API and editor admin: reports, post-visit check-ins, city requests, verification queue, four-eyes publishing, D1 schema |
| `.github/workflows/deploy.yml` | Tests on every push; deploys the Worker and the site on `main` |

## Run it locally

```bash
# Site
cd site
node src/build.js            # writes site/dist
python3 -m http.server 8765 --directory dist
# open http://localhost:8765

# Tests
node --test test/match.test.js test/i18n.test.js      # eligibility logic, translations, data integrity
pip install playwright && python3 -m playwright install chromium
python3 test/e2e.py http://localhost:8765 test-shots   # full phone-sized browser walkthrough

# API
cd ../worker
npm install
npm test                                              # API tests (Node's built-in SQLite as D1)
npx wrangler d1 execute benepisyo --local --file=schema.sql
npx wrangler dev --local --var DEV_AUTH:true --var EDITORS:you@example.com --var SITE_ORIGIN:http://localhost:8765
# admin: http://localhost:8787/admin with header X-Dev-Editor: you@example.com
```

To point the local site at the local API: `API_BASE=http://localhost:8787 node src/build.js`.

## Deploy to Cloudflare (free tier)

1. **Database:** `npx wrangler d1 create benepisyo`, paste the id into `worker/wrangler.toml`, then `npm run db:init --prefix worker`.
2. **Photo storage (optional):** `npx wrangler r2 bucket create benepisyo-files`, or delete the `r2_buckets` block.
3. **Secrets:** `npx wrangler secret put RATE_SALT` (any random string) and, after step 5, `DEPLOY_HOOK_URL`.
4. **Editors:** set `EDITORS` in `wrangler.toml` to your editors' emails. Protect `/admin*` and `/api/admin*` on the Worker's hostname with a **Cloudflare Access** application (email one-time PIN) allowing only those emails. The Worker trusts the Access email header, so these routes must only be reachable through Access.
5. **Site:** create a Cloudflare Pages project named `benepisyo`. Create a deploy hook and save it as the Worker's `DEPLOY_HOOK_URL` so publishing in the admin rebuilds the site.
6. **GitHub:** add secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and variables `SITE_URL` (e.g. `https://benepisyo.ph`), `API_BASE` (the Worker URL), `BENEFITS_URL` (`<API_BASE>/api/public/benefits`). Push to `main`.
7. **Seed content:** open `/admin` → Import → paste `data/benefits.json` → tick "Publish immediately" once.

## Editing content

All edits happen in `/admin`:

- **Verification queue** lists benefits oldest-check first. Over 90 days: recheck. Over 180 days the public badge turns to "Baka nagbago na" automatically.
- **Save draft → Submit for review → Publish.** A different editor must publish (set `ALLOW_SELF_REVIEW=true` only while you are the only editor).
- **Record a verification** after a call, visit or new official post. "Confirmed" requires an official source (law, ordinance, official site or post, or a logged direct confirmation); news and user reports can only be "Reported".
- **Reports** from "Tama pa ba ito?" arrive here with optional photo and contact. Contacts are erased automatically after 90 days.

Every benefit record needs Tagalog and English text, at least one `https` source, and a check date; the API refuses anything less.

## Data notes for the pilot

- The Calamba birthday cash gift (₱1,000) comes from a 2022 news report and is marked **Reported** until OSCA or an ordinance confirms the current amount.
- The Calamba City Scholarship Program is listed by a school, not the city, and is **Reported**.
- Office hours and phone numbers are left out until confirmed; the app hides missing fields rather than guessing.

## Privacy

No accounts. Quiz answers, the family list and checklists stay in the phone's local storage. The app never asks for ID numbers, exact income or birthdates. Rate limiting stores only a salted hash of the IP. Monthly "people got this" counts are hidden below 3 so one person's visit can't be singled out.

## Not a government site

The footer on every page says so, the app says "may qualify", never "will receive", and it never uses seals, logos or politicians' names.
