# SliceMatic

Full-stack pizza ordering system for a single-outlet restaurant. Replaces a
Google Form + manual billing process with a validated, realtime, database-backed
ordering flow.

## Architecture

- **Next.js (App Router)** on Vercel — customer app, kitchen view, admin
  dashboard, and API routes.
- **Supabase** — Postgres (menu, orders, order line items, waiter calls),
  Auth (staff login), Realtime (kitchen/admin live feeds).
- **Hybrid data flow** — browsers read the menu and subscribe to realtime
  changes directly with the anon key (guarded by RLS). All writes go through
  API routes that re-validate every field and recompute the bill from DB
  prices with the service-role key. Client-sent prices are never trusted.
- **Shared business logic** — `lib/validation.ts` and `lib/pricing.ts` run on
  both client (instant feedback) and server (enforcement). Business rules
  (discount threshold/rate, GST rate) are named constants in `lib/pricing.ts`.

## Routes

| Route | Access | Purpose |
|---|---|---|
| `/order?table=12` | Public (QR per table) | Customer ordering flow |
| `/kitchen` | Staff login | Realtime orders + waiter calls |
| `/admin` | Staff login | All-orders table |
| `/login` | — | Staff sign-in |
| `POST /api/orders` | Server | Validated order creation |
| `POST /api/waiter-call` | Server | Table assistance request |
| `POST /api/ai/*` | Stubs (501) | Seams for AI features (next phase) |

## Setup

1. Create a Supabase project at https://supabase.com.
2. In the SQL editor, run `supabase/migrations/001_init.sql`.
3. In Authentication → Users, create a staff user (email + password).
4. Copy `.env.local.example` to `.env.local` and fill in the project URL,
   anon key, and service-role key (Project Settings → API).
5. `npm install`
6. `npm run seed` — loads the three menu txt files from `data/` into the DB.
7. `npm run dev` — open http://localhost:3000/order?table=12

Menu updates: edit the txt files in `data/` and re-run `npm run seed`, or edit
rows directly in Supabase. Changes appear on next menu load — no deploy needed.

## Deploy (Vercel)

1. Push to GitHub, import the repo in Vercel.
2. Set the three env vars from `.env.local.example` in Vercel project settings.
3. Deploy. QR codes should encode `https://<your-app>.vercel.app/order?table=<n>`.

## Tests

`npm test` — Vitest unit tests covering menu parsing, all validation rules
(including the 8 assignment edge cases), discount boundary (qty 4 vs 5),
GST-on-post-discount math, and server-side order building.

## Demo checklist

1. Open `/order?table=12` → login with spaces-only name → specific error.
2. Phone `1234567890` → rejected (must start 6-9). Phone `9876543210` → accepted.
3. Build order: quantity `0`, `11`, `2.5`, `three`, empty → all rejected inline.
4. Quantity 5 → 10% discount line appears; GST computed on post-discount total.
5. Payment: confirm without a mode → error. Pick UPI → confirmation message.
6. Confirm order → animated receipt; order appears in `/kitchen` instantly.
7. Tap "Call waiter" → amber alert in kitchen; Acknowledge clears it.
8. `/kitchen` status toggle: received → preparing → ready.
9. `/admin` → full orders table with items, totals, payment mode, timestamps.
10. Edit `lib/pricing.ts` `DISCOUNT_THRESHOLD` 5 → 3, reload → discount at qty 3
    (the "change the threshold live" question).

## AI feature seams (next phase)

Documented stub routes with intended contracts in `app/api/ai/`:
upsell suggestions, mood-based recommendations, feedback insight mining.
