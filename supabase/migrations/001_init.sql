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

-- Table grants: Supabase no longer auto-exposes new tables to API roles.
-- RLS policies above still govern row-level access for anon/authenticated.
grant usage on schema public to anon, authenticated, service_role;
grant select on bases, pizzas, toppings to anon, authenticated;
grant select on orders, order_items, waiter_calls to authenticated;
grant update on orders, waiter_calls to authenticated;
grant all on bases, pizzas, toppings, orders, order_items, waiter_calls to service_role;

-- Realtime: kitchen and admin subscribe to these tables.
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table waiter_calls;
