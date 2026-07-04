# SliceMatic MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full-stack pizza ordering system (customer QR app + kitchen realtime view + admin dashboard) on Next.js + Supabase, deployable to Vercel.

**Architecture:** Hybrid: browser reads menu + realtime feeds directly via Supabase anon client; all writes (orders, waiter calls) go through Next.js API routes that re-validate and recompute the bill server-side with the service-role key. Shared pure modules (`lib/validation.ts`, `lib/pricing.ts`) run on both client (UX) and server (enforcement).

**Tech Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS, Framer Motion, @supabase/supabase-js, Vitest, tsx + dotenv (seed script).

## Global Constraints

- Name: trimmed, letters + spaces only, 2–40 chars.
- Phone: exactly 10 digits, first digit 6–9 (`/^[6-9]\d{9}$/`).
- Quantity: integer 1–10 only; reject 0, 11+, floats, strings, empty.
- Discount: 10% when quantity ≥ 5. GST: 18% on post-discount subtotal. Round to 2dp at each step.
- Payment modes: exactly `cash`, `card`, `upi`.
- Order shape: exactly 1 base + 1 pizza + 0..N toppings; ids must exist in DB; client-sent prices ignored — server recomputes from DB.
- No customer session persistence — fresh name/phone entry every visit.
- All errors surface as friendly messages; no unhandled exception may reach the user; no stack traces in API responses.
- DB is runtime source of truth for menu; txt files are seed input only.
- `order_items` snapshots `item_name` + `unit_price` at order time.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client); `SUPABASE_SERVICE_ROLE_KEY` (server only, never exposed).
- Path alias `@/*` maps to repo root.

---

### Task 1: Scaffold Next.js project + tooling

**Files:**
- Create: entire Next.js scaffold at repo root (`app/`, `package.json`, `tsconfig.json`, …)
- Create: `vitest.config.ts`, `.env.local.example`
- Modify: `package.json` (scripts), `app/globals.css`, `app/layout.tsx`

**Interfaces:**
- Produces: working `npm run dev`, `npm run build`, `npm test` commands; `@/*` import alias; dark base styling all later tasks build on.

- [ ] **Step 1: Scaffold Next.js into the existing repo**

```bash
cd /Users/sachindua/SliceMatic
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
```

Expected: scaffold completes (existing `docs/` and `.git/` do not conflict).

- [ ] **Step 2: Install runtime and dev dependencies**

```bash
npm install @supabase/supabase-js framer-motion
npm install -D vitest tsx dotenv
```

- [ ] **Step 3: Add vitest config and test script**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
```

In `package.json` scripts add:

```json
"test": "vitest run",
"seed": "tsx scripts/seed.ts"
```

- [ ] **Step 4: Create `.env.local.example`**

```bash
# Supabase — copy to .env.local and fill in from your Supabase project settings
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Server-only. NEVER expose with NEXT_PUBLIC_ prefix.
SUPABASE_SERVICE_ROLE_KEY=
```

Confirm `.gitignore` already contains `.env*` (create-next-app default). If not, add `.env.local`.

- [ ] **Step 5: Set dark base theme**

Replace `app/globals.css` content with:

```css
@import "tailwindcss";

:root {
  --background: #0a0a0f;
  --foreground: #f4f4f5;
  --accent: #ff5c1a;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
  min-height: 100dvh;
}
```

In `app/layout.tsx`, set metadata:

```tsx
export const metadata: Metadata = {
  title: "SliceMatic",
  description: "Order pizza from your table",
};
```

(Keep the rest of the generated layout as-is.)

Replace `app/page.tsx` with a minimal landing page:

```tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-5xl font-bold tracking-tight">
        Slice<span className="text-[var(--accent)]">Matic</span>
      </h1>
      <p className="text-zinc-400">Scan the QR code at your table to order.</p>
      <div className="flex gap-4 text-sm">
        <Link href="/order" className="rounded-full border border-white/15 px-5 py-2 hover:border-[var(--accent)]">Order</Link>
        <Link href="/kitchen" className="rounded-full border border-white/15 px-5 py-2 hover:border-[var(--accent)]">Kitchen</Link>
        <Link href="/admin" className="rounded-full border border-white/15 px-5 py-2 hover:border-[var(--accent)]">Admin</Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Verify build and test runner**

```bash
npm run build
npx vitest run --passWithNoTests
```

Expected: build succeeds; vitest exits 0 with "no test files found" tolerated via flag.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind, Framer Motion, Supabase client, Vitest"
```

---

### Task 2: Menu data files + defensive parser

**Files:**
- Create: `data/Types_of_Base.txt`, `data/Types_of_Pizza.txt`, `data/Types_of_Toppings.txt`
- Create: `lib/menu-parser.ts`
- Test: `tests/menu-parser.test.ts`

**Interfaces:**
- Produces: `parseMenuLine(line: string): MenuLine | null` and `parseMenuFile(content: string): { items: MenuLine[]; skipped: string[] }` where `MenuLine = { id: string; name: string; price: number }`. Consumed by Task 6 (seed script).

- [ ] **Step 1: Create the three menu txt files (format `ID ; Name ; Price`)**

`data/Types_of_Base.txt`:

```
B1 ; Thin Crust ; 149
B2 ; Thick Crust ; 169
B3 ; Whole Wheat ; 179
B4 ; Multigrain ; 199
B5 ; Cheese Burst ; 229
```

`data/Types_of_Pizza.txt`:

```
P1 ; Margherita ; 299
P2 ; California Veggie ; 319
P3 ; Farm House ; 329
P4 ; Paneer Tikka ; 339
P5 ; Greek Mediterranean ; 349
P6 ; Pepperoni Classic ; 359
P7 ; BBQ Chicken ; 369
P8 ; Chicago Deep Dish ; 379
```

`data/Types_of_Toppings.txt`:

```
T1 ; Caramelised Onions ; 39
T2 ; Sweet Corn ; 39
T3 ; Black Olives ; 49
T4 ; Green Peppers ; 49
T5 ; Jalapenos ; 49
T6 ; Roasted Garlic ; 49
T7 ; Button Mushrooms ; 59
T8 ; Peri-Peri Drizzle ; 59
T9 ; Extra Cheese ; 69
T10 ; Sun-Dried Tomatoes ; 69
```

- [ ] **Step 2: Write failing parser tests**

Create `tests/menu-parser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseMenuLine, parseMenuFile } from "@/lib/menu-parser";

describe("parseMenuLine", () => {
  it("parses a valid line with padding whitespace", () => {
    expect(parseMenuLine("  B1 ; Thin Crust ; 149  ")).toEqual({
      id: "B1",
      name: "Thin Crust",
      price: 149,
    });
  });

  it("returns null when the price field is missing", () => {
    expect(parseMenuLine("B1 ; Thin Crust")).toBeNull();
  });

  it("returns null when price is not a number", () => {
    expect(parseMenuLine("B1 ; Thin Crust ; cheap")).toBeNull();
  });

  it("returns null when price is zero or negative", () => {
    expect(parseMenuLine("B1 ; Thin Crust ; 0")).toBeNull();
    expect(parseMenuLine("B1 ; Thin Crust ; -20")).toBeNull();
  });

  it("returns null when any field is empty", () => {
    expect(parseMenuLine(" ; Thin Crust ; 149")).toBeNull();
    expect(parseMenuLine("B1 ;  ; 149")).toBeNull();
  });
});

describe("parseMenuFile", () => {
  it("collects valid lines and reports skipped ones", () => {
    const content = "B1 ; Thin Crust ; 149\n\nBAD LINE\nB2 ; Thick Crust ; 169\n";
    const result = parseMenuFile(content);
    expect(result.items).toHaveLength(2);
    expect(result.skipped).toEqual(["BAD LINE"]);
  });

  it("handles CRLF line endings", () => {
    const result = parseMenuFile("B1 ; Thin Crust ; 149\r\nB2 ; Thick Crust ; 169\r\n");
    expect(result.items).toHaveLength(2);
  });

  it("returns empty results for empty content", () => {
    expect(parseMenuFile("")).toEqual({ items: [], skipped: [] });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/menu-parser.test.ts
```

Expected: FAIL — cannot resolve `@/lib/menu-parser`.

- [ ] **Step 4: Implement the parser**

Create `lib/menu-parser.ts`:

```ts
export interface MenuLine {
  id: string;
  name: string;
  price: number;
}

/** Parses one `ID ; Name ; Price` line. Returns null for any malformed line. */
export function parseMenuLine(line: string): MenuLine | null {
  const parts = line.split(";").map((p) => p.trim());
  if (parts.length !== 3) return null;
  const [id, name, priceRaw] = parts;
  if (!id || !name || !priceRaw) return null;
  const price = Number(priceRaw);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { id, name, price };
}

/** Parses a whole menu file, skipping (and reporting) malformed lines. */
export function parseMenuFile(content: string): { items: MenuLine[]; skipped: string[] } {
  const items: MenuLine[] = [];
  const skipped: string[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    const parsed = parseMenuLine(line);
    if (parsed) items.push(parsed);
    else skipped.push(line);
  }
  return { items, skipped };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/menu-parser.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add data lib/menu-parser.ts tests/menu-parser.test.ts
git commit -m "feat: add menu data files and defensive menu file parser"
```

---

### Task 3: Pricing module

**Files:**
- Create: `lib/pricing.ts`
- Test: `tests/pricing.test.ts`

**Interfaces:**
- Produces: `computeBill(input: BillInput): Bill` with `BillInput = { basePrice: number; pizzaPrice: number; toppingPrices: number[]; quantity: number }` and `Bill = { unitPrice: number; subtotal: number; discount: number; gst: number; total: number }`; constants `DISCOUNT_THRESHOLD = 5`, `DISCOUNT_RATE = 0.10`, `GST_RATE = 0.18`; helper `round2(n: number): number` and `formatINR(n: number): string`. Consumed by Tasks 7, 10, 11.

- [ ] **Step 1: Write failing tests**

Create `tests/pricing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeBill, round2, formatINR, DISCOUNT_THRESHOLD } from "@/lib/pricing";

describe("computeBill", () => {
  // Thin Crust 149 + Margherita 299 + Extra Cheese 69 = 517/unit
  const cart = { basePrice: 149, pizzaPrice: 299, toppingPrices: [69] };

  it("computes a bill with no discount below the threshold", () => {
    const bill = computeBill({ ...cart, quantity: 4 });
    expect(bill.unitPrice).toBe(517);
    expect(bill.subtotal).toBe(2068);
    expect(bill.discount).toBe(0);
    expect(bill.gst).toBe(round2(2068 * 0.18)); // 372.24
    expect(bill.total).toBe(round2(2068 + 372.24)); // 2440.24
  });

  it("applies 10% discount exactly at the threshold (boundary: 4 vs 5)", () => {
    const at4 = computeBill({ ...cart, quantity: 4 });
    const at5 = computeBill({ ...cart, quantity: 5 });
    expect(at4.discount).toBe(0);
    expect(at5.discount).toBe(round2(517 * 5 * 0.1)); // 258.5
  });

  it("computes GST on the post-discount amount", () => {
    const bill = computeBill({ ...cart, quantity: 5 });
    const postDiscount = 2585 - 258.5; // 2326.5
    expect(bill.gst).toBe(round2(postDiscount * 0.18)); // 418.77
    expect(bill.total).toBe(round2(postDiscount + 418.77)); // 2745.27
  });

  it("handles zero toppings", () => {
    const bill = computeBill({ basePrice: 149, pizzaPrice: 299, toppingPrices: [], quantity: 1 });
    expect(bill.unitPrice).toBe(448);
  });

  it("exposes the discount threshold as a constant", () => {
    expect(DISCOUNT_THRESHOLD).toBe(5);
  });
});

describe("round2", () => {
  it("rounds to two decimal places", () => {
    expect(round2(418.7699999)).toBe(418.77);
    expect(round2(100)).toBe(100);
  });
});

describe("formatINR", () => {
  it("formats with rupee symbol and two decimals", () => {
    expect(formatINR(2440.24)).toBe("₹2,440.24");
    expect(formatINR(0)).toBe("₹0.00");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/pricing.test.ts
```

Expected: FAIL — cannot resolve `@/lib/pricing`.

- [ ] **Step 3: Implement**

Create `lib/pricing.ts`:

```ts
// Business rules — Rajan's current policy. Change these constants to change policy.
export const DISCOUNT_THRESHOLD = 5; // pizzas
export const DISCOUNT_RATE = 0.1; // 10%
export const GST_RATE = 0.18; // 18%

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface BillInput {
  basePrice: number;
  pizzaPrice: number;
  toppingPrices: number[];
  quantity: number;
}

export interface Bill {
  unitPrice: number;
  subtotal: number;
  discount: number;
  gst: number;
  total: number;
}

export function computeBill({ basePrice, pizzaPrice, toppingPrices, quantity }: BillInput): Bill {
  const unitPrice = round2(basePrice + pizzaPrice + toppingPrices.reduce((sum, p) => sum + p, 0));
  const subtotal = round2(unitPrice * quantity);
  const discount = quantity >= DISCOUNT_THRESHOLD ? round2(subtotal * DISCOUNT_RATE) : 0;
  const gst = round2((subtotal - discount) * GST_RATE);
  const total = round2(subtotal - discount + gst);
  return { unitPrice, subtotal, discount, gst, total };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run tests/pricing.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pricing.ts tests/pricing.test.ts
git commit -m "feat: add pricing module with discount and GST rules"
```

---

### Task 4: Validation module

**Files:**
- Create: `lib/validation.ts`
- Test: `tests/validation.test.ts`

**Interfaces:**
- Produces: `ValidationResult = { ok: true } | { ok: false; error: string }`; functions `validateName(raw: unknown)`, `validatePhone(raw: unknown)`, `validateQuantity(raw: unknown)`, `validatePaymentMode(raw: unknown)`, `validateTableId(raw: unknown)` — all return `ValidationResult`; `PAYMENT_MODES = ["cash", "card", "upi"] as const` and `type PaymentMode`. Consumed by Tasks 7, 9, 10, 11.

- [ ] **Step 1: Write failing tests**

Create `tests/validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  validateName,
  validatePhone,
  validateQuantity,
  validatePaymentMode,
  validateTableId,
} from "@/lib/validation";

describe("validateName", () => {
  it("accepts a normal name", () => {
    expect(validateName("Rajan Sharma")).toEqual({ ok: true });
  });
  it("rejects spaces-only input", () => {
    expect(validateName("    ").ok).toBe(false);
  });
  it("rejects empty and non-string input", () => {
    expect(validateName("").ok).toBe(false);
    expect(validateName(undefined).ok).toBe(false);
    expect(validateName(42).ok).toBe(false);
  });
  it("rejects names shorter than 2 or longer than 40 chars", () => {
    expect(validateName("A").ok).toBe(false);
    expect(validateName("A".repeat(41)).ok).toBe(false);
    expect(validateName("Al").ok).toBe(true);
    expect(validateName("A".repeat(40)).ok).toBe(true);
  });
  it("rejects digits and symbols", () => {
    expect(validateName("Rajan123").ok).toBe(false);
    expect(validateName("Rajan!").ok).toBe(false);
  });
});

describe("validatePhone", () => {
  it("accepts a valid Indian mobile number", () => {
    expect(validatePhone("9876543210")).toEqual({ ok: true });
  });
  it("rejects a 10-digit number starting with 1", () => {
    expect(validatePhone("1234567890").ok).toBe(false);
  });
  it("rejects wrong lengths, letters, and empty", () => {
    expect(validatePhone("98765").ok).toBe(false);
    expect(validatePhone("98765432101").ok).toBe(false);
    expect(validatePhone("98765abcde").ok).toBe(false);
    expect(validatePhone("").ok).toBe(false);
    expect(validatePhone(undefined).ok).toBe(false);
  });
});

describe("validateQuantity", () => {
  it("accepts integers 1 through 10", () => {
    expect(validateQuantity("1")).toEqual({ ok: true });
    expect(validateQuantity("10")).toEqual({ ok: true });
    expect(validateQuantity(7)).toEqual({ ok: true });
  });
  it("rejects 0, 11, and negatives", () => {
    expect(validateQuantity("0").ok).toBe(false);
    expect(validateQuantity("11").ok).toBe(false);
    expect(validateQuantity("-3").ok).toBe(false);
  });
  it("rejects floats and words", () => {
    expect(validateQuantity("2.5").ok).toBe(false);
    expect(validateQuantity("three").ok).toBe(false);
  });
  it("rejects empty input", () => {
    expect(validateQuantity("").ok).toBe(false);
    expect(validateQuantity("   ").ok).toBe(false);
    expect(validateQuantity(undefined).ok).toBe(false);
  });
});

describe("validatePaymentMode", () => {
  it("accepts exactly cash, card, upi", () => {
    expect(validatePaymentMode("cash")).toEqual({ ok: true });
    expect(validatePaymentMode("card")).toEqual({ ok: true });
    expect(validatePaymentMode("upi")).toEqual({ ok: true });
  });
  it("rejects anything else", () => {
    expect(validatePaymentMode("bitcoin").ok).toBe(false);
    expect(validatePaymentMode("").ok).toBe(false);
    expect(validatePaymentMode(4).ok).toBe(false);
  });
});

describe("validateTableId", () => {
  it("accepts simple alphanumeric table ids", () => {
    expect(validateTableId("12")).toEqual({ ok: true });
    expect(validateTableId("A-3")).toEqual({ ok: true });
  });
  it("rejects empty, overlong, and junk values", () => {
    expect(validateTableId("").ok).toBe(false);
    expect(validateTableId("   ").ok).toBe(false);
    expect(validateTableId("x".repeat(11)).ok).toBe(false);
    expect(validateTableId("12; drop").ok).toBe(false);
    expect(validateTableId(null).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/validation.test.ts
```

Expected: FAIL — cannot resolve `@/lib/validation`.

- [ ] **Step 3: Implement**

Create `lib/validation.ts`:

```ts
export type ValidationResult = { ok: true } | { ok: false; error: string };

export const PAYMENT_MODES = ["cash", "card", "upi"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export function validateName(raw: unknown): ValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Please enter your name." };
  }
  const name = raw.trim();
  if (name.length < 2) return { ok: false, error: "Name must be at least 2 characters." };
  if (name.length > 40) return { ok: false, error: "Name must be 40 characters or fewer." };
  if (!/^[A-Za-z ]+$/.test(name)) {
    return { ok: false, error: "Name can only contain letters and spaces." };
  }
  return { ok: true };
}

export function validatePhone(raw: unknown): ValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Please enter your phone number." };
  }
  const phone = raw.trim();
  if (!/^\d{10}$/.test(phone)) {
    return { ok: false, error: "Phone number must be exactly 10 digits." };
  }
  if (!/^[6-9]/.test(phone)) {
    return { ok: false, error: "Phone number must start with 6, 7, 8 or 9." };
  }
  return { ok: true };
}

export function validateQuantity(raw: unknown): ValidationResult {
  const asString = typeof raw === "number" ? String(raw) : raw;
  if (typeof asString !== "string" || asString.trim() === "") {
    return { ok: false, error: "Please enter a quantity." };
  }
  const n = Number(asString.trim());
  if (!Number.isInteger(n)) {
    return { ok: false, error: "Quantity must be a whole number — no decimals or words." };
  }
  if (n < 1) return { ok: false, error: "Quantity must be at least 1." };
  if (n > 10) return { ok: false, error: "Maximum 10 pizzas per order." };
  return { ok: true };
}

export function validatePaymentMode(raw: unknown): ValidationResult {
  if (typeof raw !== "string" || !PAYMENT_MODES.includes(raw as PaymentMode)) {
    return { ok: false, error: "Payment mode must be Cash, Card or UPI." };
  }
  return { ok: true };
}

export function validateTableId(raw: unknown): ValidationResult {
  if (typeof raw !== "string") return { ok: false, error: "Missing table number." };
  const table = raw.trim();
  if (table.length === 0 || table.length > 10 || !/^[A-Za-z0-9-]+$/.test(table)) {
    return { ok: false, error: "Invalid table number." };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run tests/validation.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/validation.ts tests/validation.test.ts
git commit -m "feat: add shared validation module for name, phone, quantity, payment, table"
```

---

### Task 5: Supabase schema migration + client helpers + shared types

**Files:**
- Create: `supabase/migrations/001_init.sql`
- Create: `lib/types.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`

**Interfaces:**
- Produces: SQL schema (tables `bases`, `pizzas`, `toppings`, `orders`, `order_items`, `waiter_calls`, RLS, realtime publication); `supabase` browser client singleton; `createAdminClient(): SupabaseClient` (server-only); types `MenuItem { id: string; name: string; price: number }`, `Menu { bases: MenuItem[]; pizzas: MenuItem[]; toppings: MenuItem[] }`. Consumed by Tasks 6–14.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/001_init.sql`:

```sql
-- SliceMatic schema. Paste into the Supabase SQL editor and run once.

create table bases (
  id text primary key,
  name text not null,
  price numeric(10,2) not null check (price > 0)
);

create table pizzas (
  id text primary key,
  name text not null,
  price numeric(10,2) not null check (price > 0)
);

create table toppings (
  id text primary key,
  name text not null,
  price numeric(10,2) not null check (price > 0)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  table_id text not null,
  subtotal numeric(10,2) not null,
  discount numeric(10,2) not null default 0,
  gst numeric(10,2) not null,
  total numeric(10,2) not null,
  payment_mode text not null check (payment_mode in ('cash', 'card', 'upi')),
  status text not null default 'received' check (status in ('received', 'preparing', 'ready')),
  created_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_type text not null check (item_type in ('base', 'pizza', 'topping')),
  item_id text not null,
  -- Snapshot name and price at order time so later menu edits never change past bills.
  item_name text not null,
  unit_price numeric(10,2) not null,
  quantity int not null check (quantity between 1 and 10)
);

create table waiter_calls (
  id uuid primary key default gen_random_uuid(),
  table_id text not null,
  status text not null default 'pending' check (status in ('pending', 'acknowledged')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Row Level Security: menu is public-read; operational tables are staff-only.
-- All inserts happen server-side via the service role key (bypasses RLS).
alter table bases enable row level security;
alter table pizzas enable row level security;
alter table toppings enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table waiter_calls enable row level security;

create policy "public read bases" on bases for select using (true);
create policy "public read pizzas" on pizzas for select using (true);
create policy "public read toppings" on toppings for select using (true);

create policy "staff read orders" on orders for select to authenticated using (true);
create policy "staff update orders" on orders for update to authenticated using (true);
create policy "staff read order_items" on order_items for select to authenticated using (true);
create policy "staff read waiter_calls" on waiter_calls for select to authenticated using (true);
create policy "staff update waiter_calls" on waiter_calls for update to authenticated using (true);

-- Realtime: kitchen and admin subscribe to these tables.
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table waiter_calls;
```

- [ ] **Step 2: Create shared types**

Create `lib/types.ts`:

```ts
export interface MenuItem {
  id: string;
  name: string;
  price: number;
}

export interface Menu {
  bases: MenuItem[];
  pizzas: MenuItem[];
  toppings: MenuItem[];
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  item_type: "base" | "pizza" | "topping";
  item_id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
}

export interface OrderRow {
  id: string;
  customer_name: string;
  phone: string;
  table_id: string;
  subtotal: number;
  discount: number;
  gst: number;
  total: number;
  payment_mode: "cash" | "card" | "upi";
  status: "received" | "preparing" | "ready";
  created_at: string;
  order_items?: OrderItemRow[];
}

export interface WaiterCallRow {
  id: string;
  table_id: string;
  status: "pending" | "acknowledged";
  created_at: string;
  resolved_at: string | null;
}
```

- [ ] **Step 3: Create the browser client singleton**

Create `lib/supabase/client.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

// Anon-key client for the browser: menu reads, staff auth, realtime subscriptions.
// RLS protects everything; anon users can only read menu tables.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

- [ ] **Step 4: Create the server admin client factory**

Create `lib/supabase/admin.ts`:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. Server-only: bypasses RLS to insert orders and waiter calls.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
```

Also install the guard package:

```bash
npm install server-only
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: build succeeds (env vars are only read at request time, not build time).

- [ ] **Step 6: Commit**

```bash
git add supabase lib/types.ts lib/supabase package.json package-lock.json
git commit -m "feat: add Supabase schema migration, client helpers, and shared types"
```

---

### Task 6: Seed script

**Files:**
- Create: `scripts/seed.ts`

**Interfaces:**
- Consumes: `parseMenuFile` from Task 2; `.env.local` values.
- Produces: `npm run seed` — parses the three txt files and upserts into `bases`/`pizzas`/`toppings`.

- [ ] **Step 1: Write the seed script**

Create `scripts/seed.ts`:

```ts
import { config } from "dotenv";
import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { parseMenuFile } from "../lib/menu-parser";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const FILES: { file: string; table: string }[] = [
  { file: "Types_of_Base.txt", table: "bases" },
  { file: "Types_of_Pizza.txt", table: "pizzas" },
  { file: "Types_of_Toppings.txt", table: "toppings" },
];

async function seed() {
  for (const { file, table } of FILES) {
    const fullPath = path.join(process.cwd(), "data", file);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf8");
    } catch {
      console.error(`Cannot read ${fullPath} — file missing?`);
      process.exit(1);
    }

    const { items, skipped } = parseMenuFile(content);
    for (const line of skipped) {
      console.warn(`  [${file}] skipped malformed line: "${line}"`);
    }
    if (items.length === 0) {
      console.error(`  [${file}] contained no valid items — aborting.`);
      process.exit(1);
    }

    const { error } = await supabase.from(table).upsert(items, { onConflict: "id" });
    if (error) {
      console.error(`  [${table}] upsert failed: ${error.message}`);
      process.exit(1);
    }
    console.log(`  [${table}] seeded ${items.length} items (${skipped.length} skipped).`);
  }
  console.log("Seed complete.");
}

seed();
```

- [ ] **Step 2: Verify it fails gracefully without keys**

```bash
npm run seed
```

Expected: exits with "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" — no stack trace. (Full success run happens once the user creates the Supabase project; document in README, Task 15.)

- [ ] **Step 3: Commit**

```bash
git add scripts/seed.ts
git commit -m "feat: add defensive menu seed script (txt files -> Supabase)"
```

---

### Task 7: Order builder + POST /api/orders

**Files:**
- Create: `lib/orders.ts`
- Create: `app/api/orders/route.ts`
- Test: `tests/orders.test.ts`

**Interfaces:**
- Consumes: `computeBill`, `Bill` (Task 3); validators (Task 4); `Menu`, `MenuItem` (Task 5).
- Produces:
  - `OrderPayload = { customerName: string; phone: string; tableId: string; baseId: string; pizzaId: string; toppingIds: string[]; quantity: number; paymentMode: string }`
  - `buildOrder(payload: OrderPayload, menu: Menu): BuildResult` where `BuildResult = { ok: true; order: NewOrder; items: NewOrderItem[]; bill: Bill } | { ok: false; error: string }`
  - `NewOrder = { customer_name, phone, table_id, subtotal, discount, gst, total, payment_mode }`, `NewOrderItem = { item_type, item_id, item_name, unit_price, quantity }`
  - HTTP: `POST /api/orders` → `201 { orderId, bill }` | `400/503/500 { error }`. Consumed by Task 11 (payment step).

- [ ] **Step 1: Write failing tests for buildOrder**

Create `tests/orders.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildOrder, OrderPayload } from "@/lib/orders";
import type { Menu } from "@/lib/types";

const menu: Menu = {
  bases: [{ id: "B1", name: "Thin Crust", price: 149 }],
  pizzas: [{ id: "P1", name: "Margherita", price: 299 }],
  toppings: [
    { id: "T9", name: "Extra Cheese", price: 69 },
    { id: "T3", name: "Black Olives", price: 49 },
  ],
};

const valid: OrderPayload = {
  customerName: "Rajan Sharma",
  phone: "9876543210",
  tableId: "12",
  baseId: "B1",
  pizzaId: "P1",
  toppingIds: ["T9"],
  quantity: 5,
  paymentMode: "upi",
};

describe("buildOrder", () => {
  it("builds a correct order with discount and GST from DB prices", () => {
    const result = buildOrder(valid, menu);
    if (!result.ok) throw new Error(result.error);
    expect(result.order.subtotal).toBe(2585); // 517 * 5
    expect(result.order.discount).toBe(258.5);
    expect(result.order.gst).toBe(418.77);
    expect(result.order.total).toBe(2745.27);
    expect(result.order.payment_mode).toBe("upi");
    expect(result.items).toHaveLength(3); // base + pizza + 1 topping
    expect(result.items[0]).toEqual({
      item_type: "base",
      item_id: "B1",
      item_name: "Thin Crust",
      unit_price: 149,
      quantity: 5,
    });
  });

  it("trims the customer name before storing", () => {
    const result = buildOrder({ ...valid, customerName: "  Rajan Sharma  " }, menu);
    if (!result.ok) throw new Error(result.error);
    expect(result.order.customer_name).toBe("Rajan Sharma");
  });

  it("rejects invalid name, phone, quantity, payment mode, table", () => {
    expect(buildOrder({ ...valid, customerName: "   " }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, phone: "1234567890" }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, quantity: 11 }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, quantity: 2.5 }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, paymentMode: "bitcoin" }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, tableId: "" }, menu).ok).toBe(false);
  });

  it("rejects unknown item ids (client cannot invent items or prices)", () => {
    expect(buildOrder({ ...valid, baseId: "B99" }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, pizzaId: "P99" }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, toppingIds: ["T99"] }, menu).ok).toBe(false);
  });

  it("rejects duplicate topping ids", () => {
    expect(buildOrder({ ...valid, toppingIds: ["T9", "T9"] }, menu).ok).toBe(false);
  });

  it("rejects a malformed payload shape without throwing", () => {
    expect(buildOrder({} as OrderPayload, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, toppingIds: "T9" as unknown as string[] }, menu).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/orders.test.ts
```

Expected: FAIL — cannot resolve `@/lib/orders`.

- [ ] **Step 3: Implement buildOrder**

Create `lib/orders.ts`:

```ts
import { computeBill, Bill } from "@/lib/pricing";
import {
  validateName,
  validatePhone,
  validateQuantity,
  validatePaymentMode,
  validateTableId,
  PaymentMode,
} from "@/lib/validation";
import type { Menu, MenuItem } from "@/lib/types";

export interface OrderPayload {
  customerName: string;
  phone: string;
  tableId: string;
  baseId: string;
  pizzaId: string;
  toppingIds: string[];
  quantity: number;
  paymentMode: string;
}

export interface NewOrder {
  customer_name: string;
  phone: string;
  table_id: string;
  subtotal: number;
  discount: number;
  gst: number;
  total: number;
  payment_mode: PaymentMode;
}

export interface NewOrderItem {
  item_type: "base" | "pizza" | "topping";
  item_id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
}

export type BuildResult =
  | { ok: true; order: NewOrder; items: NewOrderItem[]; bill: Bill }
  | { ok: false; error: string };

function findItem(list: MenuItem[], id: unknown): MenuItem | undefined {
  if (typeof id !== "string") return undefined;
  return list.find((item) => item.id === id);
}

/**
 * Validates the payload and rebuilds the entire bill from DB menu prices.
 * Client-sent prices are never trusted — only ids, quantity, and mode.
 */
export function buildOrder(payload: OrderPayload, menu: Menu): BuildResult {
  const nameCheck = validateName(payload?.customerName);
  if (!nameCheck.ok) return nameCheck;
  const phoneCheck = validatePhone(payload?.phone);
  if (!phoneCheck.ok) return phoneCheck;
  const tableCheck = validateTableId(payload?.tableId);
  if (!tableCheck.ok) return tableCheck;
  const qtyCheck = validateQuantity(payload?.quantity);
  if (!qtyCheck.ok) return qtyCheck;
  const paymentCheck = validatePaymentMode(payload?.paymentMode);
  if (!paymentCheck.ok) return paymentCheck;

  const base = findItem(menu.bases, payload.baseId);
  if (!base) return { ok: false, error: "Selected base was not found on the menu." };
  const pizza = findItem(menu.pizzas, payload.pizzaId);
  if (!pizza) return { ok: false, error: "Selected pizza was not found on the menu." };

  if (!Array.isArray(payload.toppingIds)) {
    return { ok: false, error: "Toppings must be a list." };
  }
  if (new Set(payload.toppingIds).size !== payload.toppingIds.length) {
    return { ok: false, error: "Each topping can only be added once." };
  }
  const toppings: MenuItem[] = [];
  for (const id of payload.toppingIds) {
    const topping = findItem(menu.toppings, id);
    if (!topping) return { ok: false, error: "A selected topping was not found on the menu." };
    toppings.push(topping);
  }

  const quantity = Number(payload.quantity);
  const bill = computeBill({
    basePrice: Number(base.price),
    pizzaPrice: Number(pizza.price),
    toppingPrices: toppings.map((t) => Number(t.price)),
    quantity,
  });

  const order: NewOrder = {
    customer_name: payload.customerName.trim(),
    phone: payload.phone.trim(),
    table_id: payload.tableId.trim(),
    subtotal: bill.subtotal,
    discount: bill.discount,
    gst: bill.gst,
    total: bill.total,
    payment_mode: payload.paymentMode as PaymentMode,
  };

  const items: NewOrderItem[] = [
    { item_type: "base", item_id: base.id, item_name: base.name, unit_price: Number(base.price), quantity },
    { item_type: "pizza", item_id: pizza.id, item_name: pizza.name, unit_price: Number(pizza.price), quantity },
    ...toppings.map((t): NewOrderItem => ({
      item_type: "topping",
      item_id: t.id,
      item_name: t.name,
      unit_price: Number(t.price),
      quantity,
    })),
  ];

  return { ok: true, order, items, bill };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run tests/orders.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Implement the API route**

Create `app/api/orders/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildOrder, OrderPayload } from "@/lib/orders";
import type { Menu } from "@/lib/types";

export async function POST(request: Request) {
  try {
    let payload: OrderPayload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const db = createAdminClient();
    const [bases, pizzas, toppings] = await Promise.all([
      db.from("bases").select("id,name,price"),
      db.from("pizzas").select("id,name,price"),
      db.from("toppings").select("id,name,price"),
    ]);
    if (bases.error || pizzas.error || toppings.error) {
      return NextResponse.json(
        { error: "Menu is temporarily unavailable. Please try again in a moment." },
        { status: 503 }
      );
    }

    const menu: Menu = { bases: bases.data, pizzas: pizzas.data, toppings: toppings.data };
    const result = buildOrder(payload, menu);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const inserted = await db.from("orders").insert(result.order).select("id").single();
    if (inserted.error) {
      return NextResponse.json(
        { error: "Could not save your order. Please try again." },
        { status: 503 }
      );
    }

    const itemRows = result.items.map((item) => ({ ...item, order_id: inserted.data.id }));
    const itemsInsert = await db.from("order_items").insert(itemRows);
    if (itemsInsert.error) {
      // Roll back the order header so we never leave a half-saved order.
      await db.from("orders").delete().eq("id", inserted.data.id);
      return NextResponse.json(
        { error: "Could not save your order. Please try again." },
        { status: 503 }
      );
    }

    return NextResponse.json({ orderId: inserted.data.id, bill: result.bill }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 6: Verify build and full test suite**

```bash
npm run build && npm test
```

Expected: build succeeds, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/orders.ts app/api/orders tests/orders.test.ts
git commit -m "feat: add server-side order builder and POST /api/orders"
```

---

### Task 8: Waiter-call API + AI seam stubs

**Files:**
- Create: `app/api/waiter-call/route.ts`
- Create: `app/api/ai/upsell/route.ts`, `app/api/ai/mood/route.ts`, `app/api/ai/feedback/route.ts`

**Interfaces:**
- Consumes: `validateTableId` (Task 4), `createAdminClient` (Task 5).
- Produces: `POST /api/waiter-call` body `{ tableId: string }` → `201 { callId }` | `400/503/500 { error }` (consumed by Task 11). AI routes: `POST` → `501 { error: "Not implemented yet." }`.

- [ ] **Step 1: Implement the waiter-call route**

Create `app/api/waiter-call/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateTableId } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    let body: { tableId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const tableCheck = validateTableId(body?.tableId);
    if (!tableCheck.ok) {
      return NextResponse.json({ error: tableCheck.error }, { status: 400 });
    }

    const db = createAdminClient();
    const inserted = await db
      .from("waiter_calls")
      .insert({ table_id: body.tableId!.trim() })
      .select("id")
      .single();
    if (inserted.error) {
      return NextResponse.json(
        { error: "Could not reach the staff right now. Please try again." },
        { status: 503 }
      );
    }

    return NextResponse.json({ callId: inserted.data.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the three AI seam stubs**

Create `app/api/ai/upsell/route.ts`:

```ts
import { NextResponse } from "next/server";

/**
 * AI SEAM — Smart Upselling Assistant (not built in this phase).
 *
 * Intended contract:
 *   POST { baseId, pizzaId, toppingIds, quantity }
 *   -> 200 { suggestion: { itemType: "topping", itemId: string, reason: string } }
 *
 * Intended implementation: combine a hand-authored pairing table with an
 * OpenRouter LLM call that phrases one contextual suggestion. On LLM
 * failure/timeout, fall back to the pairing table alone or skip silently.
 */
export async function POST() {
  return NextResponse.json({ error: "Not implemented yet." }, { status: 501 });
}
```

Create `app/api/ai/mood/route.ts`:

```ts
import { NextResponse } from "next/server";

/**
 * AI SEAM — Mood-Based Menu Recommender (not built in this phase).
 *
 * Intended contract:
 *   POST { mood: string }
 *   -> 200 { suggestions: [{ pizzaId: string, reason: string }] }  // 2-3 items
 *
 * Intended implementation: OpenRouter LLM constrained by a system prompt that
 * maps mood -> menu attributes and may only return ids present in the DB menu.
 * Empty/nonsense/off-topic input returns a default popular-combo suggestion.
 */
export async function POST() {
  return NextResponse.json({ error: "Not implemented yet." }, { status: 501 });
}
```

Create `app/api/ai/feedback/route.ts`:

```ts
import { NextResponse } from "next/server";

/**
 * AI SEAM — Review & Feedback Insight Miner (not built in this phase).
 *
 * Intended contract:
 *   POST { texts: string[] }
 *   -> 200 { themes: [{ label: string, count: number, examples: string[] }] }
 *
 * Intended implementation: batch reviews/feedback through an OpenRouter LLM
 * that clusters recurring complaints into actionable categories for admin.
 */
export async function POST() {
  return NextResponse.json({ error: "Not implemented yet." }, { status: 501 });
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/api/waiter-call app/api/ai
git commit -m "feat: add waiter-call endpoint and stubbed AI seam routes"
```

---

### Task 9: Customer flow — order context, table gate, login screen

**Files:**
- Create: `components/order/OrderContext.tsx`
- Create: `components/order/LoginForm.tsx`
- Create: `components/order/TablePicker.tsx`
- Create: `app/order/page.tsx`

**Interfaces:**
- Consumes: `validateName`, `validatePhone`, `validateTableId` (Task 4).
- Produces: `OrderProvider` + `useOrder()` hook exposing `{ step, setStep, tableId, customerName, setCustomerName, phone, setPhone, baseId, setBaseId, pizzaId, setPizzaId, toppingIds, toggleTopping, quantity, setQuantity, paymentMode, setPaymentMode, orderId, setOrderId, confirmedBill, setConfirmedBill }` with `Step = "login" | "menu" | "payment" | "confirmed"`. Consumed by Tasks 10–11.

- [ ] **Step 1: Create the order context**

Create `components/order/OrderContext.tsx`:

```tsx
"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import type { Bill } from "@/lib/pricing";
import type { PaymentMode } from "@/lib/validation";

export type Step = "login" | "menu" | "payment" | "confirmed";

interface OrderState {
  step: Step;
  setStep: (s: Step) => void;
  tableId: string;
  customerName: string;
  setCustomerName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  baseId: string | null;
  setBaseId: (v: string | null) => void;
  pizzaId: string | null;
  setPizzaId: (v: string | null) => void;
  toppingIds: string[];
  toggleTopping: (id: string) => void;
  quantity: number;
  setQuantity: (v: number) => void;
  paymentMode: PaymentMode | null;
  setPaymentMode: (v: PaymentMode | null) => void;
  orderId: string | null;
  setOrderId: (v: string | null) => void;
  confirmedBill: Bill | null;
  setConfirmedBill: (v: Bill | null) => void;
}

const OrderContext = createContext<OrderState | null>(null);

export function OrderProvider({ tableId, children }: { tableId: string; children: ReactNode }) {
  const [step, setStep] = useState<Step>("login");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [baseId, setBaseId] = useState<string | null>(null);
  const [pizzaId, setPizzaId] = useState<string | null>(null);
  const [toppingIds, setToppingIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [confirmedBill, setConfirmedBill] = useState<Bill | null>(null);

  const toggleTopping = (id: string) =>
    setToppingIds((current) =>
      current.includes(id) ? current.filter((t) => t !== id) : [...current, id]
    );

  return (
    <OrderContext.Provider
      value={{
        step, setStep, tableId,
        customerName, setCustomerName, phone, setPhone,
        baseId, setBaseId, pizzaId, setPizzaId,
        toppingIds, toggleTopping, quantity, setQuantity,
        paymentMode, setPaymentMode,
        orderId, setOrderId, confirmedBill, setConfirmedBill,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export function useOrder(): OrderState {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrder must be used inside OrderProvider");
  return ctx;
}
```

- [ ] **Step 2: Create the login form**

Create `components/order/LoginForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useOrder } from "./OrderContext";
import { validateName, validatePhone } from "@/lib/validation";

export default function LoginForm() {
  const { tableId, customerName, setCustomerName, phone, setPhone, setStep } = useOrder();
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nameCheck = validateName(customerName);
    const phoneCheck = validatePhone(phone);
    setNameError(nameCheck.ok ? null : nameCheck.error);
    setPhoneError(phoneCheck.ok ? null : phoneCheck.error);
    if (nameCheck.ok && phoneCheck.ok) {
      setCustomerName(customerName.trim());
      setStep("menu");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      className="mx-auto w-full max-w-md p-6"
    >
      <p className="mb-1 text-sm text-zinc-400">Table {tableId}</p>
      <h1 className="mb-8 text-3xl font-bold">
        Welcome to Slice<span className="text-[var(--accent)]">Matic</span>
      </h1>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm text-zinc-300">Your name</label>
          <input
            id="name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="e.g. Rajan Sharma"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none backdrop-blur focus:border-[var(--accent)]"
          />
          {nameError && <p className="mt-1 text-sm text-red-400">{nameError}</p>}
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-sm text-zinc-300">Phone number</label>
          <input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile number"
            inputMode="numeric"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none backdrop-blur focus:border-[var(--accent)]"
          />
          {phoneError && <p className="mt-1 text-sm text-red-400">{phoneError}</p>}
        </div>
        <button
          type="submit"
          className="w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-black transition hover:brightness-110"
        >
          Start ordering
        </button>
      </form>
    </motion.div>
  );
}
```

- [ ] **Step 3: Create the table picker (missing/invalid `table` param fallback)**

Create `components/order/TablePicker.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validateTableId } from "@/lib/validation";

export default function TablePicker() {
  const router = useRouter();
  const [table, setTable] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const check = validateTableId(table);
    if (!check.ok) {
      setError("Please enter the table number shown on your table (e.g. 12).");
      return;
    }
    router.replace(`/order?table=${encodeURIComponent(table.trim())}`);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={handleSubmit} noValidate className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold">Which table are you at?</h1>
        <p className="text-sm text-zinc-400">
          We couldn&apos;t detect your table from the QR code. Enter it below to continue.
        </p>
        <input
          value={table}
          onChange={(e) => setTable(e.target.value)}
          placeholder="Table number"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center outline-none focus:border-[var(--accent)]"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" className="w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-black">
          Continue
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Create the order page shell**

Create `app/order/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { OrderProvider, useOrder } from "@/components/order/OrderContext";
import LoginForm from "@/components/order/LoginForm";
import TablePicker from "@/components/order/TablePicker";
import { validateTableId } from "@/lib/validation";

function Steps() {
  const { step } = useOrder();
  return (
    <main className="min-h-dvh">
      <AnimatePresence mode="wait">
        {step === "login" && <LoginForm key="login" />}
      </AnimatePresence>
    </main>
  );
}

function OrderFlow() {
  const params = useSearchParams();
  const rawTable = params.get("table") ?? "";
  if (!validateTableId(rawTable).ok) return <TablePicker />;
  return (
    <OrderProvider tableId={rawTable.trim()}>
      <Steps />
    </OrderProvider>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={null}>
      <OrderFlow />
    </Suspense>
  );
}
```

(Note: Task 10 and 11 extend `Steps` with the remaining step components.)

- [ ] **Step 5: Verify build + manual check**

```bash
npm run build
```

Expected: build succeeds. Then `npm run dev`, open `http://localhost:3000/order` → table picker appears; `http://localhost:3000/order?table=12` → login form appears; submit empty/spaces-only name, phone starting with 1 → specific inline errors, no crash.

- [ ] **Step 6: Commit**

```bash
git add components/order app/order
git commit -m "feat: add customer order shell with table gate and validated login"
```

---

### Task 10: Customer flow — menu builder + live bill

**Files:**
- Create: `components/order/MenuBuilder.tsx`
- Create: `components/order/BillLines.tsx`
- Modify: `app/order/page.tsx` (add menu step)

**Interfaces:**
- Consumes: `useOrder()` (Task 9), `supabase` client (Task 5), `computeBill`/`formatINR` (Task 3), `validateQuantity` (Task 4), `Menu` type (Task 5).
- Produces: `MenuBuilder` component (advances to step `"payment"`); `BillLines({ bill }: { bill: Bill })` shared receipt-lines component (also consumed by Task 11).

- [ ] **Step 1: Create the shared bill lines component**

Create `components/order/BillLines.tsx`:

```tsx
import type { Bill } from "@/lib/pricing";
import { formatINR, GST_RATE, DISCOUNT_RATE } from "@/lib/pricing";

export default function BillLines({ bill, quantity }: { bill: Bill; quantity: number }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex justify-between text-zinc-300">
        <span>Per pizza</span>
        <span>{formatINR(bill.unitPrice)}</span>
      </div>
      <div className="flex justify-between text-zinc-300">
        <span>Subtotal ({quantity} × {formatINR(bill.unitPrice)})</span>
        <span>{formatINR(bill.subtotal)}</span>
      </div>
      {bill.discount > 0 && (
        <div className="flex justify-between text-emerald-400">
          <span>Bulk discount ({DISCOUNT_RATE * 100}%)</span>
          <span>−{formatINR(bill.discount)}</span>
        </div>
      )}
      <div className="flex justify-between text-zinc-300">
        <span>GST ({GST_RATE * 100}%)</span>
        <span>{formatINR(bill.gst)}</span>
      </div>
      <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-base font-bold">
        <span>Total</span>
        <span className="text-[var(--accent)]">{formatINR(bill.total)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the menu builder**

Create `components/order/MenuBuilder.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useOrder } from "./OrderContext";
import BillLines from "./BillLines";
import { supabase } from "@/lib/supabase/client";
import { computeBill, formatINR } from "@/lib/pricing";
import { validateQuantity } from "@/lib/validation";
import type { Menu, MenuItem } from "@/lib/types";

type LoadState = "loading" | "error" | "ready";

function SelectableCard({
  item, selected, onSelect,
}: { item: MenuItem; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left backdrop-blur transition ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent)]/10"
          : "border-white/10 bg-white/5 hover:border-white/30"
      }`}
    >
      <span>{item.name}</span>
      <span className="text-sm text-zinc-400">{formatINR(Number(item.price))}</span>
    </button>
  );
}

export default function MenuBuilder() {
  const {
    customerName, baseId, setBaseId, pizzaId, setPizzaId,
    toppingIds, toggleTopping, quantity, setQuantity, setStep,
  } = useOrder();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [qtyInput, setQtyInput] = useState(String(quantity));
  const [qtyError, setQtyError] = useState<string | null>(null);

  async function loadMenu() {
    setLoadState("loading");
    const [bases, pizzas, toppings] = await Promise.all([
      supabase.from("bases").select("id,name,price").order("price"),
      supabase.from("pizzas").select("id,name,price").order("price"),
      supabase.from("toppings").select("id,name,price").order("price"),
    ]);
    if (bases.error || pizzas.error || toppings.error) {
      setLoadState("error");
      return;
    }
    setMenu({ bases: bases.data, pizzas: pizzas.data, toppings: toppings.data });
    setLoadState("ready");
  }

  useEffect(() => {
    loadMenu();
  }, []);

  function handleQtyChange(raw: string) {
    setQtyInput(raw);
    const check = validateQuantity(raw);
    if (check.ok) {
      setQuantity(Number(raw.trim()));
      setQtyError(null);
    } else {
      setQtyError(check.error);
    }
  }

  const bill = useMemo(() => {
    if (!menu || !baseId || !pizzaId || qtyError) return null;
    const base = menu.bases.find((b) => b.id === baseId);
    const pizza = menu.pizzas.find((p) => p.id === pizzaId);
    if (!base || !pizza) return null;
    const toppingPrices = menu.toppings
      .filter((t) => toppingIds.includes(t.id))
      .map((t) => Number(t.price));
    return computeBill({
      basePrice: Number(base.price),
      pizzaPrice: Number(pizza.price),
      toppingPrices,
      quantity,
    });
  }, [menu, baseId, pizzaId, toppingIds, quantity, qtyError]);

  if (loadState === "loading") {
    return <p className="p-10 text-center text-zinc-400">Loading menu…</p>;
  }
  if (loadState === "error" || !menu) {
    return (
      <div className="p-10 text-center">
        <p className="mb-4 text-zinc-300">Couldn&apos;t load the menu. Check your connection.</p>
        <button onClick={loadMenu} className="rounded-xl bg-[var(--accent)] px-6 py-2 font-semibold text-black">
          Retry
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      className="mx-auto w-full max-w-md space-y-8 p-6 pb-44"
    >
      <h2 className="text-2xl font-bold">Build your pizza, {customerName.split(" ")[0]}</h2>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">1 · Choose a base</h3>
        <div className="space-y-2">
          {menu.bases.map((item) => (
            <SelectableCard key={item.id} item={item} selected={baseId === item.id} onSelect={() => setBaseId(item.id)} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">2 · Choose a pizza</h3>
        <div className="space-y-2">
          {menu.pizzas.map((item) => (
            <SelectableCard key={item.id} item={item} selected={pizzaId === item.id} onSelect={() => setPizzaId(item.id)} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">3 · Toppings (optional)</h3>
        <div className="space-y-2">
          {menu.toppings.map((item) => (
            <SelectableCard key={item.id} item={item} selected={toppingIds.includes(item.id)} onSelect={() => toggleTopping(item.id)} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">4 · How many?</h3>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleQtyChange(String(Math.max(1, quantity - 1)))}
            className="h-12 w-12 rounded-xl border border-white/10 bg-white/5 text-xl"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <input
            value={qtyInput}
            onChange={(e) => handleQtyChange(e.target.value)}
            inputMode="numeric"
            aria-label="Quantity"
            className="h-12 w-20 rounded-xl border border-white/10 bg-white/5 text-center text-lg outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => handleQtyChange(String(Math.min(10, quantity + 1)))}
            className="h-12 w-12 rounded-xl border border-white/10 bg-white/5 text-xl"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
        {qtyError && <p className="mt-2 text-sm text-red-400">{qtyError}</p>}
        <p className="mt-2 text-xs text-zinc-500">Order 5 or more and get 10% off automatically.</p>
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-black/70 p-4 backdrop-blur-xl">
        <div className="mx-auto max-w-md">
          {bill ? (
            <>
              <BillLines bill={bill} quantity={quantity} />
              <button
                onClick={() => setStep("payment")}
                className="mt-3 w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-black"
              >
                Continue to payment
              </button>
            </>
          ) : (
            <p className="py-2 text-center text-sm text-zinc-400">
              {qtyError ? "Fix the quantity to continue." : "Pick a base and a pizza to see your bill."}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 3: Wire the menu step into the page**

In `app/order/page.tsx`, add the import and the step:

```tsx
import MenuBuilder from "@/components/order/MenuBuilder";
```

In `Steps`, inside `AnimatePresence`:

```tsx
{step === "login" && <LoginForm key="login" />}
{step === "menu" && <MenuBuilder key="menu" />}
```

- [ ] **Step 4: Verify build + manual check**

```bash
npm run build
```

Expected: build succeeds. Manual (`npm run dev`, needs seeded Supabase or shows retry state — both are correct behavior): without keys, menu step shows friendly retry, not a blank page. Quantity input rejects `0`, `11`, `2.5`, `three`, empty with messages; discount line appears at qty 5.

- [ ] **Step 5: Commit**

```bash
git add components/order app/order/page.tsx
git commit -m "feat: add menu builder with live itemised bill preview"
```

---

### Task 11: Customer flow — payment, confirmation, call-waiter button

**Files:**
- Create: `components/order/PaymentSelect.tsx`
- Create: `components/order/Confirmation.tsx`
- Create: `components/order/CallWaiterButton.tsx`
- Modify: `app/order/page.tsx` (add steps + floating button)

**Interfaces:**
- Consumes: `useOrder()` (Task 9), `BillLines` (Task 10), `POST /api/orders` (Task 7), `POST /api/waiter-call` (Task 8), `PAYMENT_MODES` (Task 4).
- Produces: complete customer flow, steps `"payment"` and `"confirmed"`.

- [ ] **Step 1: Create the payment step**

Create `components/order/PaymentSelect.tsx`:

```tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useOrder } from "./OrderContext";
import { PAYMENT_MODES, PaymentMode } from "@/lib/validation";

const MODE_LABELS: Record<PaymentMode, string> = { cash: "Cash", card: "Card", upi: "UPI" };

export default function PaymentSelect() {
  const {
    customerName, phone, tableId, baseId, pizzaId, toppingIds, quantity,
    paymentMode, setPaymentMode, setStep, setOrderId, setConfirmedBill,
  } = useOrder();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function placeOrder() {
    if (!paymentMode) {
      setError("Please choose how you'd like to pay.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName, phone, tableId,
          baseId, pizzaId, toppingIds, quantity, paymentMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not place the order. Please try again.");
        return;
      }
      setOrderId(data.orderId);
      setConfirmedBill(data.bill);
      setStep("confirmed");
    } catch {
      setError("Couldn't reach the kitchen — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      className="mx-auto w-full max-w-md space-y-6 p-6"
    >
      <button onClick={() => setStep("menu")} className="text-sm text-zinc-400 hover:text-white">
        ← Back to menu
      </button>
      <h2 className="text-2xl font-bold">How would you like to pay?</h2>
      <div className="grid grid-cols-3 gap-3">
        {PAYMENT_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => { setPaymentMode(mode); setError(null); }}
            className={`rounded-xl border py-6 font-semibold backdrop-blur transition ${
              paymentMode === mode
                ? "border-[var(--accent)] bg-[var(--accent)]/10"
                : "border-white/10 bg-white/5 hover:border-white/30"
            }`}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>
      {paymentMode && (
        <p className="text-sm text-emerald-400">
          Paying by {MODE_LABELS[paymentMode]} — confirm below to send your order to the kitchen.
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={placeOrder}
        disabled={submitting}
        className="w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-black disabled:opacity-50"
      >
        {submitting ? "Placing order…" : "Confirm order"}
      </button>
    </motion.div>
  );
}
```

- [ ] **Step 2: Create the confirmation receipt**

Create `components/order/Confirmation.tsx`:

```tsx
"use client";

import { motion } from "framer-motion";
import { useOrder } from "./OrderContext";
import BillLines from "./BillLines";

const MODE_LABELS: Record<string, string> = { cash: "Cash", card: "Card", upi: "UPI" };

export default function Confirmation() {
  const { customerName, tableId, orderId, confirmedBill, quantity, paymentMode } = useOrder();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto w-full max-w-md p-6"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur"
      >
        <div className="mb-4 text-center">
          <p className="text-4xl">🍕</p>
          <h2 className="mt-2 text-2xl font-bold text-emerald-400">Order sent to the kitchen!</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Thanks {customerName.split(" ")[0]} — we&apos;ll bring it to table {tableId}.
          </p>
          {orderId && (
            <p className="mt-1 text-xs text-zinc-500">Order #{orderId.slice(0, 8)}</p>
          )}
        </div>
        {confirmedBill && <BillLines bill={confirmedBill} quantity={quantity} />}
        {paymentMode && (
          <p className="mt-4 text-center text-sm text-zinc-300">
            Payment mode: <span className="font-semibold">{MODE_LABELS[paymentMode]}</span>
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 3: Create the floating call-waiter button**

Create `components/order/CallWaiterButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useOrder } from "./OrderContext";

type CallState = "idle" | "calling" | "called" | "error";

export default function CallWaiterButton() {
  const { tableId } = useOrder();
  const [state, setState] = useState<CallState>("idle");

  async function callWaiter() {
    if (state === "calling" || state === "called") return;
    setState("calling");
    try {
      const res = await fetch("/api/waiter-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId }),
      });
      if (!res.ok) throw new Error();
      setState("called");
      setTimeout(() => setState("idle"), 5000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 5000);
    }
  }

  const label =
    state === "calling" ? "Calling…"
    : state === "called" ? "Waiter on the way ✓"
    : state === "error" ? "Failed — tap to retry"
    : "🛎 Call waiter";

  return (
    <button
      onClick={callWaiter}
      className={`fixed bottom-40 right-4 z-50 rounded-full px-5 py-3 text-sm font-semibold shadow-lg backdrop-blur transition ${
        state === "called"
          ? "bg-emerald-500 text-black"
          : state === "error"
          ? "bg-red-500 text-white"
          : "border border-white/15 bg-black/60 text-white hover:border-[var(--accent)]"
      }`}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 4: Wire the remaining steps into the page**

`app/order/page.tsx` — final `Steps` component:

```tsx
import PaymentSelect from "@/components/order/PaymentSelect";
import Confirmation from "@/components/order/Confirmation";
import CallWaiterButton from "@/components/order/CallWaiterButton";
```

```tsx
function Steps() {
  const { step } = useOrder();
  return (
    <main className="min-h-dvh">
      <AnimatePresence mode="wait">
        {step === "login" && <LoginForm key="login" />}
        {step === "menu" && <MenuBuilder key="menu" />}
        {step === "payment" && <PaymentSelect key="payment" />}
        {step === "confirmed" && <Confirmation key="confirmed" />}
      </AnimatePresence>
      {step !== "login" && <CallWaiterButton />}
    </main>
  );
}
```

- [ ] **Step 5: Verify build + manual check**

```bash
npm run build && npm test
```

Expected: build succeeds, tests pass. Manual with dev server: payment step shows exactly Cash/Card/UPI; confirm without selecting → error message; network failure → friendly toast, cart preserved (back button returns to filled menu).

- [ ] **Step 6: Commit**

```bash
git add components/order app/order/page.tsx
git commit -m "feat: complete customer flow with payment, confirmation, and call-waiter"
```

---

### Task 12: Staff auth — login page + guard hook

**Files:**
- Create: `app/login/page.tsx`
- Create: `components/staff/useRequireAuth.ts`
- Create: `components/staff/StaffHeader.tsx`

**Interfaces:**
- Consumes: `supabase` client (Task 5).
- Produces: `useRequireAuth(): "loading" | "authed" | "anon"` hook; `StaffHeader({ title })` nav bar with kitchen/admin links and sign-out. Consumed by Tasks 13–14.

- [ ] **Step 1: Create the auth guard hook**

Create `components/staff/useRequireAuth.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export type AuthStatus = "loading" | "authed" | "anon";

/** Redirects to /login when there is no staff session. */
export function useRequireAuth(): AuthStatus {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? "authed" : "anon");
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? "authed" : "anon");
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (status === "anon") router.replace("/login");
  }, [status, router]);

  return status;
}
```

- [ ] **Step 2: Create the staff header**

Create `components/staff/StaffHeader.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function StaffHeader({ title }: { title: string }) {
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/10 bg-black/70 px-6 py-4 backdrop-blur-xl">
      <h1 className="text-lg font-bold">{title}</h1>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/kitchen" className="text-zinc-300 hover:text-white">Kitchen</Link>
        <Link href="/admin" className="text-zinc-300 hover:text-white">Admin</Link>
        <button onClick={signOut} className="rounded-lg border border-white/15 px-3 py-1 text-zinc-300 hover:border-[var(--accent)]">
          Sign out
        </button>
      </nav>
    </header>
  );
}
```

- [ ] **Step 3: Create the login page**

Create `app/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (authError) {
      setError("Login failed — check your email and password.");
      return;
    }
    router.replace("/kitchen");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={handleSubmit} noValidate className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Staff login</h1>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-[var(--accent)]"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-[var(--accent)]"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-black disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/login components/staff
git commit -m "feat: add staff login page and auth guard hook"
```

---

### Task 13: Kitchen realtime view

**Files:**
- Create: `app/kitchen/page.tsx`

**Interfaces:**
- Consumes: `useRequireAuth`, `StaffHeader` (Task 12), `supabase` (Task 5), `OrderRow`/`WaiterCallRow` types (Task 5), `formatINR` (Task 3).
- Produces: `/kitchen` — realtime order feed with status toggles + waiter-call alerts with acknowledge.

- [ ] **Step 1: Implement the kitchen page**

Create `app/kitchen/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase/client";
import { useRequireAuth } from "@/components/staff/useRequireAuth";
import StaffHeader from "@/components/staff/StaffHeader";
import { formatINR } from "@/lib/pricing";
import type { OrderRow, WaiterCallRow } from "@/lib/types";

const NEXT_STATUS: Record<OrderRow["status"], OrderRow["status"] | null> = {
  received: "preparing",
  preparing: "ready",
  ready: null,
};

const STATUS_STYLES: Record<OrderRow["status"], string> = {
  received: "bg-sky-500/15 text-sky-300",
  preparing: "bg-amber-500/15 text-amber-300",
  ready: "bg-emerald-500/15 text-emerald-300",
};

export default function KitchenPage() {
  const auth = useRequireAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [calls, setCalls] = useState<WaiterCallRow[]>([]);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    const [ordersRes, callsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("waiter_calls")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
    ]);
    if (ordersRes.error || callsRes.error) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setOrders(ordersRes.data as OrderRow[]);
    setCalls(callsRes.data as WaiterCallRow[]);
  }, []);

  useEffect(() => {
    if (auth !== "authed") return;
    refresh();
    const channel = supabase
      .channel("kitchen")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "waiter_calls" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [auth, refresh]);

  async function advanceStatus(order: OrderRow) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    const { error } = await supabase.from("orders").update({ status: next }).eq("id", order.id);
    if (!error) refresh();
  }

  async function acknowledgeCall(call: WaiterCallRow) {
    const { error } = await supabase
      .from("waiter_calls")
      .update({ status: "acknowledged", resolved_at: new Date().toISOString() })
      .eq("id", call.id);
    if (!error) refresh();
  }

  if (auth !== "authed") {
    return <p className="p-10 text-center text-zinc-400">Checking access…</p>;
  }

  return (
    <main className="min-h-dvh">
      <StaffHeader title="Kitchen" />
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        {loadError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            Couldn&apos;t load live data — check the connection.{" "}
            <button onClick={refresh} className="underline">Retry</button>
          </div>
        )}

        <AnimatePresence>
          {calls.map((call) => (
            <motion.div
              key={call.id}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
            >
              <div>
                <p className="font-bold text-amber-300">🛎 Table {call.table_id} needs assistance</p>
                <p className="text-xs text-zinc-400">
                  Called at {new Date(call.created_at).toLocaleTimeString()}
                </p>
              </div>
              <button
                onClick={() => acknowledgeCall(call)}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black"
              >
                Acknowledge
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Incoming orders
        </h2>
        {orders.length === 0 && !loadError && (
          <p className="text-zinc-500">No orders yet — they&apos;ll appear here instantly.</p>
        )}
        <AnimatePresence>
          {orders.map((order) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold">
                    Table {order.table_id} · {order.customer_name}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {new Date(order.created_at).toLocaleTimeString()} · {formatINR(Number(order.total))} · {order.payment_mode.toUpperCase()}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[order.status]}`}>
                  {order.status}
                </span>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-zinc-300">
                {(order.order_items ?? []).map((item) => (
                  <li key={item.id}>
                    {item.quantity} × {item.item_name}
                    <span className="text-zinc-500"> ({item.item_type})</span>
                  </li>
                ))}
              </ul>
              {NEXT_STATUS[order.status] && (
                <button
                  onClick={() => advanceStatus(order)}
                  className="mt-3 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold hover:border-[var(--accent)]"
                >
                  Mark {NEXT_STATUS[order.status]}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: build succeeds. Manual (needs live Supabase): unauthenticated visit to `/kitchen` redirects to `/login`; placing a customer order pops it into the feed without refresh; waiter call shows amber banner; Acknowledge clears it.

- [ ] **Step 3: Commit**

```bash
git add app/kitchen
git commit -m "feat: add realtime kitchen view with order statuses and waiter-call alerts"
```

---

### Task 14: Admin dashboard

**Files:**
- Create: `app/admin/page.tsx`

**Interfaces:**
- Consumes: `useRequireAuth`, `StaffHeader` (Task 12), `supabase` (Task 5), `OrderRow` type (Task 5), `formatINR` (Task 3).
- Produces: `/admin` — live table of all orders.

- [ ] **Step 1: Implement the admin page**

Create `app/admin/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRequireAuth } from "@/components/staff/useRequireAuth";
import StaffHeader from "@/components/staff/StaffHeader";
import { formatINR } from "@/lib/pricing";
import type { OrderRow } from "@/lib/types";

export default function AdminPage() {
  const auth = useRequireAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setOrders(data as OrderRow[]);
  }, []);

  useEffect(() => {
    if (auth !== "authed") return;
    refresh();
    const channel = supabase
      .channel("admin")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [auth, refresh]);

  if (auth !== "authed") {
    return <p className="p-10 text-center text-zinc-400">Checking access…</p>;
  }

  return (
    <main className="min-h-dvh">
      <StaffHeader title="Admin — Orders" />
      <div className="mx-auto max-w-5xl p-6">
        {loadError && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            Couldn&apos;t load orders — check the connection.{" "}
            <button onClick={refresh} className="underline">Retry</button>
          </div>
        )}
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Table</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-white/10">
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                    {new Date(order.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{order.table_id}</td>
                  <td className="px-4 py-3">
                    {order.customer_name}
                    <span className="block text-xs text-zinc-500">{order.phone}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {(order.order_items ?? [])
                      .map((item) => `${item.quantity}× ${item.item_name}`)
                      .join(", ")}
                  </td>
                  <td className="px-4 py-3 uppercase">{order.payment_mode}</td>
                  <td className="px-4 py-3">{order.status}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatINR(Number(order.total))}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && !loadError && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                    No orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify build + full test suite**

```bash
npm run build && npm test
```

Expected: build succeeds, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/admin
git commit -m "feat: add admin dashboard with live orders table"
```

---

### Task 15: README, demo checklist, final verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: setup + deploy + demo documentation.

- [ ] **Step 1: Write README.md**

```markdown
# SliceMatic

Full-stack pizza ordering system for a single-outlet restaurant. Replaces a
Google Form + manual billing process with a validated, realtime, database-backed
ordering flow.

## Architecture

- **Next.js 15 (App Router)** on Vercel — customer app, kitchen view, admin
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
```

- [ ] **Step 2: Final verification**

```bash
npm run build && npm test && npx eslint .
```

Expected: all pass, no errors.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup, deploy, and demo checklist"
```
