# SliceMatic

Full-stack pizza ordering system for a single-outlet restaurant. Replaces a
Google Form + manual billing process with a validated, realtime, database-backed
ordering flow.

## Architecture

- **Next.js (App Router)** on Vercel — customer app, kitchen view, admin
  dashboard, and API routes.
- **Supabase** — Postgres (menu, orders, order line items, waiter calls,
  upsell rules/events), Auth (staff login), Realtime (kitchen/admin live feeds).
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
| `/admin/upsell` | Staff login | Smart upsell rules, stats, AI rule generation |
| `/login` | — | Staff sign-in |
| `POST /api/orders` | Server | Validated order creation |
| `POST /api/waiter-call` | Server | Table assistance request |
| `POST /api/ai/upsell` | Server | Customer-facing upsell suggestion |
| `POST /api/ai/upsell/event` | Server | Track accepted/skipped upsells |
| `POST /api/admin/upsell/generate-rules` | Staff API | Generate draft rules with OpenRouter |
| `POST /api/admin/upsell/publish-rules` | Staff API | Publish approved draft rules |

## Setup

1. Create a Supabase project at https://supabase.com.
2. In the SQL editor, run `supabase/migrations/001_init.sql`.
3. In Authentication → Users, create a staff user (email + password).
4. Copy `.env.local.example` to `.env.local` and fill in the project URL,
   anon key, service-role key (Project Settings → API), and OpenRouter key.
5. `npm install`
6. `npm run seed` — loads the menu txt files from `data/` into the DB.
7. `npm run dev` — open http://localhost:3000/order?table=12

Menu updates: edit the txt files in `data/` and re-run `npm run seed`, or edit
rows directly in Supabase. Changes appear on next menu load — no deploy needed.

## Deploy (Vercel)

1. Push to GitHub, import the repo in Vercel.
2. Set the env vars from `.env.local.example` in Vercel project settings.
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

## AI Feature: Smart Upselling Assistant

SliceMatic currently has no consistent way to increase order value. Add-on
suggestions depend on staff memory and may be missed during busy hours.

The Smart Upselling Assistant has two parts:

1. **Checkout suggestion** — before payment, `/api/ai/upsell` selects one valid
   item from the live menu using approved `upsell_rules`. OpenRouter then writes
   one short customer-facing sentence. If OpenRouter fails or times out, the app
   uses a deterministic fallback sentence and checkout continues.
2. **Admin rule generator** — `/admin/upsell` lets staff generate draft rules
   from the current menu, current rules, previous orders, and upsell event
   performance. The AI output is saved as draft suggestions first. Live checkout
   rules change only after staff clicks **Publish Draft**.

The LLM never gets customer names or phone numbers. It receives only menu items,
current rules, aggregated order patterns, and upsell performance stats. The
backend validates every generated rule against current menu IDs, so changed menu
items are handled safely and invented items are rejected.

**Model:** `openai/gpt-4o-mini` through OpenRouter. This task is short structured
JSON and short copy generation, so a fast, cost-effective model is enough.

**Customer prompt**

```text
You are the Smart Upselling Assistant for SliceMatic, a single-outlet pizza brand.
Your job is to write one short, polite upsell suggestion for the customer's current pizza order.

Strict rules:
1. Suggest ONLY the candidate item provided by the backend.
2. Do NOT invent menu items, prices, discounts, combos, coupons, delivery promises, or availability.
3. Do NOT suggest an item already present in the customer's order.
4. Keep the message under 25 words.
5. Sound natural, helpful, and non-pushy.
6. Mention why the suggested item fits the current pizza.
7. Do not use emojis.
8. Do not mention AI, model, prompt, backend, database, or rules.
9. Return ONLY valid JSON in this exact format:
{ "message": "short upsell sentence", "confidence": "high" | "medium" | "low" }

If the candidate item is not relevant, return:
{ "message": "", "confidence": "low" }
```

**Rule-generator prompt**

```text
You are the Smart Upselling Rule Generator for SliceMatic pizza ordering system.
Your job is to generate upsell rules from the provided menu, existing upsell rules, order patterns, and upsell performance stats.

Rules:
1. Return ONLY valid JSON.
2. Use ONLY item IDs provided in the menu.
3. Do NOT invent menu items.
4. Do NOT suggest the same item as the trigger item.
5. Suggested items may be bases, pizzas, toppings, or beverages only when that type exists in the provided menu.
6. If beverages exist in the menu, beverages may be suggested. If beverages are absent, do not suggest beverages.
7. Prefer toppings, beverages, and sensible base upgrades over replacing the selected pizza.
8. Do NOT suggest an item that is already commonly rejected in the performance data.
9. If there is no order or event history, use food-pairing logic based on item names.
10. Generate at most 10 rules.
11. Each rule must have a clear business reason explainable to a restaurant owner.

Return JSON in this format:
{
  "mode": "cold_start" | "data_driven",
  "rules": [
    {
      "trigger_type": "base" | "pizza" | "topping" | "beverage",
      "trigger_id": "valid_item_id",
      "suggest_type": "base" | "pizza" | "topping" | "beverage",
      "suggest_id": "valid_item_id",
      "priority": 1,
      "reason": "short reason",
      "confidence": "high" | "medium" | "low"
    }
  ]
}
```
