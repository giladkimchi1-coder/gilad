# Binenfeld Site Log — יומן אתר בינפלד

You are building the standalone server version of a Hebrew (RTL) construction site-management app.
A working prototype already exists: `current-app.html` (single-file app, ~165 KB). It is the **reference
implementation** — when a behavior or rule is unclear, read how the prototype does it and port it.
All existing data is in `data/` and all files (photos, PDFs) are in `assets/`.

## The user
Gilad — Construction Manager at Binenfeld (modular villas built on shipping containers with shotcrete;
factory at Kibbutz Yavne; first project "כרם בן זמרה", id `kbz`). He is **not a developer**.
- Talk to him in Hebrew, in plain words. One step at a time.
- When you need choices or confirmation from him, ask a **multiple-choice question** (he strongly prefers this).
- He is opening the GitHub / Supabase / Vercel / Anthropic accounts himself — guide him click by click.
  Never ask him to paste secret keys into chat; have him paste them into `.env.local` (or Vercel env settings).
- **Nothing is ever sent to WhatsApp (or anywhere) without his explicit approval in the app.**

## Stack
- Next.js (App Router, TypeScript) + Tailwind, RTL (`<html dir="rtl" lang="he">`), mobile-first, installable PWA.
- Supabase: Postgres, Auth (email magic link / Google), Storage (bucket `files`), Row Level Security.
- Vercel hosting. GitHub repo.
- Claude API (Anthropic) server-side only, for reading delivery notes / invoices / payroll invoices from photos
  (structured JSON output). API key stays on the server.

## Users & permissions
Right now only Gilad logs in (role `admin`). Build roles anyway so others can be added later:
- `admin` — everything.
- `accounting` — sees costs, hours, pay, budget.
- `foreman` — fills logs, plan, docs, orders; **never sees hours, rates, pay or any ₪ amounts** (hide in UI AND enforce with RLS).
- `procurement` — orders.
Pay data (hours, rates, payroll, sub/equipment costs) lives in separate tables readable only by admin/accounting.

## Features (all exist in the prototype — port them)
Tabs: תוכנית עבודה · גאנט · יומן עבודה · תקציב (admin) · תעודות וחשבוניות · הזמנות רכש · תוכניות · פועלים.
Project switcher + project management (create / delete project — admin only; deleting removes its private data too).

1. **Daily log (יומן עבודה)** per date, two locations: `factory` (מפעל) and `site` (אתר). Per location:
   - Jobs: choose chapter → one or more sub-jobs (multi-select) → one or more workers (multi-select). Never auto-fill work from a worker's trade.
   - Subcontractors (name, work; cost admin-only).
   - Heavy equipment כלי צמ"ה (type from list in `settings/equipment`, supplier/operator, what it did, hours; cost admin-only).
   - Goods that arrived (from delivery notes of that day + free text).
   - Weather, issues, photos. Copy-from-yesterday. Edit/delete a log. Summary view after filling.
   - Hours per worker (admin): default = standard day (Sun–Thu 06:30–19:00 = 12.5h, Fri 07:00–16:00 = 9h)
     minus `dailyDeduction` (1h travel/breaks) for dates ≥ `deductionFrom` (2026-10-01). Rate 61 ₪/h excl. VAT (`private/labor`), per-worker override in `private/rates`.
2. **WhatsApp outbox with approval.** After a log is saved, admin presses "אשר לשליחה". This freezes the exact text
   (`waLogText` in the prototype) + photo ids into the outbox. Only approved items are ever sent. The WhatsApp
   text must NEVER contain hours or costs. Format: `*פרויקט X – יומן עבודה – יום … *`, per-location sections, link to app.
   Groups: logs → "מודולר-מש' קזס כרם בן זמרה"; docs → "כרם בן זמרה תעודות משלוח".
   **Sending mechanism is not decided yet** — build an adapter interface + a "copy text / share" button for now.
   Recommended later: WhatsApp Business API on a company number.
3. **Docs (תעודות וחשבוניות)**: upload photo → AI reads vendor, number, date, items, net/total → user confirms/edits.
   Types delivery / invoice / partial. Link delivery notes ↔ invoices (`links`, `invoicedBy`), budget line, location, linked purchase order.
   Sanity-check dates (AI sometimes misreads the year — e.g. doc `mwfh6lmeqvepszrz9cjg` has 2025-10-26, should be 2026-10-26; ask Gilad to confirm).
4. **Budget**: lines (`budget`) with planned amount; actual = invoices/partials (net) per line + labor (`labor` line:
   payroll invoice if one exists for the month, otherwise estimate from hours) + `subsday` line (sub costs from logs)
   + equipment costs go to `transport` line ("הובלה, מנוף והצבה").
5. **Labor & payroll**: monthly report of hours per worker; monthly payroll invoice from the manpower agency (total only)
   is uploaded, AI-read, and split between workers by their log hours. Sept 2026: 393.5h, net 24,003.5 ₪, total 28,324.13 ₪.
6. **Gantt / work plan**: tasks with code, kind (exec/order/wait/milestone/setup), where (factory/site), dur (workdays),
   deps, critical, actualStart/actualEnd. Calendar = 5.5-day week (Fri = 0.5, Sat off). Baseline from `ganttOrigin`
   (2026-09-20); forecast uses actual dates + today. **The app asks** "did X start / finish?" — never auto-marks.
   Daily plan tab shows what should happen today/tomorrow. Port `computeSchedule` exactly.
7. **Purchase orders**: status new/sent/delivered/cancelled, items text, destination (Yavne factory / site), needed-by,
   linked Gantt code, linked delivery doc, source app/whatsapp. Message format (`orderMsg`):
   `*עבור פרויקט <name>*` / items / `*הובלה ל<dest>*`. Alerts when an order blocks a Gantt task and is late.
   Orders are also imported from the WhatsApp group "רכש י.ג ביננפלד" (messages starting `*עבור פרויקט …*`), deduplicated.
8. **Plans (תוכניות)**: PDFs with title, category, revision, superseded flag, image previews; view inline and download.
   Must open on a phone browser.
9. **Workers registry (shared across projects)**: nickname (`name`, the name used in logs), fullName, latinName, role,
   location, active, optional phone. **Never store passport/ID numbers.** Vendors and job-types (13 chapters) also shared.

## Data in `data/` (Firestore-style JSON export, one file per document; file name = doc id)
```
projects/{pid}.json                     kbz = כרם בן זמרה; mmmiwo8kcheyzywngf98 = שביל חדש לייד 541
projects/{pid}/tasks/*.json             Gantt tasks (171 for kbz)
projects/{pid}/logs/{YYYY-MM-DD}.json   daily logs
projects/{pid}/docs/*.json              delivery notes / invoices (image = asset id)
projects/{pid}/budget/*.json            budget lines
projects/{pid}/plans/*.json             plans (asset = PDF id, previews = image ids)
projects/{pid}/orders/*.json            purchase orders
workers/ vendors/ jobtypes/ settings/   shared
private/labor.json, private/rates.json  pay settings (admin/accounting only)
private/hours/{pid}/{date}.json         workerHours, subCosts, equipCosts
private/payroll/{pid}/{YYYY-MM}.json    monthly payroll invoice
```
Fields like `image`, `asset`, `previews`, `photos` hold **asset ids**; the file is `assets/<id>.<ext>`.
User ids like `u_gfYCx9oPWdk1FONX2xpbkQ` are Gilad in the old system — map them to his new Supabase user.

## Implementation notes (what exists now)
- Supabase project `djvppvnmqkdjkmbhmjej` (EU, Ireland). Keys + DB password + pooler host in `.env.local`.
  `npm run db:migrate` applies `supabase/migrations/*.sql`; `npm run db:import` loads `data/` + `assets/` (adds missing only; `--overwrite` at cut-over).
- Data model: one table `app.store(path, col, id, data jsonb)` mirroring the Firestore paths above. Not directly readable;
  clients use RPCs `store_list/get/set/merge/add/delete/delete_project` which enforce roles (`app.profiles.role`) and strip
  money fields from docs for foreman/procurement. Realtime: `public.store_ticks` (one row per collection) → client refetches.
- UI: the prototype was ported as-is to `src/legacy/app.js` + `markup.ts` (same rules/functions, e.g. `computeSchedule`, `waLogText`),
  with services injected from `src/legacy/services.ts`. Files: bucket `files`, key = asset id, served via `/blob/<id>`.
- Login: magic link only (`shouldCreateUser: false`); Gilad's user exists (admin). New users get no role until set in `app.profiles`.
- Local testing: `npx tsx scripts/test-login.ts <role>` prints a login URL for a temporary test user; `--delete` removes it.
- Hosting: Vercel project `binenfeld-app` (Hobby for now; move to Pro before real company use) → https://binenfeld-app.vercel.app.
  Deploy from this folder with `npx vercel@latest deploy --prod` (CLI is logged in; `.vercelignore` keeps data/, assets/, .env* off the server).
  `npx tsx scripts/vercel-env.ts` copies the 4 runtime keys from `.env.local` to Vercel. Not connected to GitHub auto-deploy yet.
- Supabase Auth URL config still needs: Site URL = the Vercel URL, redirect URLs `https://binenfeld-app.vercel.app/**` and `http://localhost:3000/**`
  (needs Gilad's GitHub login to the Supabase dashboard). Until then magic links redirect to localhost.
- Anthropic: org "Binenfeld", key `binenfeld-app` (never expires) is set; account has no credit yet (Gilad chose manual entry for now) → AI route returns `no_credit`.
- Additions beyond the prototype: payroll invoice upload (workers tab), paste-import of orders from the WhatsApp group (orders tab),
  year sanity warning on scanned docs, share/mark-sent buttons in the outbox. WhatsApp texts contain no hours or ₪ amounts.

## Build plan (do in order; show Gilad a working result after each phase)
0. Check tools (Node LTS, Git); help install what's missing. Create the Next.js project, push to GitHub.
1. Guide account setup: GitHub → Supabase (project in EU region) → Vercel (import the repo) → Anthropic Console (API key, set a monthly spend limit).
2. Database schema + RLS + storage bucket; **import script** `scripts/import.ts` that loads `data/` and uploads `assets/`
   (keep the old ids, keep it re-runnable/idempotent — a fresh export will be provided at cut-over).
3. Login, project switcher, workers, daily log + summary + approval outbox (copy/share button).
4. Docs with AI reading. 5. Budget, labor, payroll, monthly report. 6. Gantt + daily plan + "did it start/finish?" questions.
7. Purchase orders. 8. Plans. 9. WhatsApp sending (after Gilad decides the method).
Test on a phone-size screen. Never delete or overwrite imported data without asking.
