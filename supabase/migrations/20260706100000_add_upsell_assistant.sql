-- Smart Upselling Assistant schema.
-- Additive only: existing ordering tables stay unchanged.

create table upsell_rule_generations (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'published', 'failed')),
  mode text not null default 'cold_start' check (mode in ('cold_start', 'data_driven')),
  model text not null,
  input_summary jsonb not null,
  ai_response jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table upsell_rules (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid references upsell_rule_generations(id) on delete set null,
  trigger_type text not null check (trigger_type in ('base', 'pizza', 'topping', 'beverage', 'any')),
  trigger_id text,
  suggest_type text not null check (suggest_type in ('base', 'pizza', 'topping', 'beverage')),
  suggest_id text not null,
  priority int not null default 100,
  min_quantity int not null default 1 check (min_quantity between 1 and 10),
  max_quantity int check (max_quantity between 1 and 10),
  reason_template text not null,
  active boolean not null default true,
  source text not null default 'manual' check (source in ('manual', 'ai', 'fallback')),
  created_at timestamptz not null default now(),
  check (trigger_type = 'any' or trigger_id is not null),
  check (max_quantity is null or max_quantity >= min_quantity)
);

create table upsell_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete set null,
  rule_id uuid references upsell_rules(id) on delete set null,
  cart_signature text not null,
  suggested_type text not null check (suggested_type in ('base', 'pizza', 'topping', 'beverage')),
  suggested_id text not null,
  suggested_name text not null,
  suggested_price numeric(10,2) not null check (suggested_price >= 0),
  ai_message text not null,
  displayed boolean not null default true,
  accepted boolean,
  quantity int check (quantity between 1 and 10),
  revenue_impact numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table upsell_rule_suggestions (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references upsell_rule_generations(id) on delete cascade,
  published_rule_id uuid references upsell_rules(id) on delete set null,
  trigger_type text not null check (trigger_type in ('base', 'pizza', 'topping', 'beverage')),
  trigger_id text not null,
  suggest_type text not null check (suggest_type in ('base', 'pizza', 'topping', 'beverage')),
  suggest_id text not null,
  reason_template text not null,
  priority int not null default 100,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create index upsell_rules_active_priority_idx on upsell_rules(active, priority);
create index upsell_events_rule_idx on upsell_events(rule_id);
create index upsell_events_created_idx on upsell_events(created_at desc);
create index upsell_rule_suggestions_generation_idx on upsell_rule_suggestions(generation_id);

alter table upsell_rule_generations enable row level security;
alter table upsell_rules enable row level security;
alter table upsell_events enable row level security;
alter table upsell_rule_suggestions enable row level security;

create policy "staff read upsell_rule_generations" on upsell_rule_generations
  for select to authenticated using (true);
create policy "staff read upsell_rules" on upsell_rules
  for select to authenticated using (true);
create policy "staff read upsell_events" on upsell_events
  for select to authenticated using (true);
create policy "staff read upsell_rule_suggestions" on upsell_rule_suggestions
  for select to authenticated using (true);

grant select on upsell_rule_generations, upsell_rules, upsell_events, upsell_rule_suggestions to authenticated;
grant all on upsell_rule_generations, upsell_rules, upsell_events, upsell_rule_suggestions to service_role;

alter publication supabase_realtime add table upsell_rules;
alter publication supabase_realtime add table upsell_events;
alter publication supabase_realtime add table upsell_rule_generations;
alter publication supabase_realtime add table upsell_rule_suggestions;

insert into upsell_rules
  (trigger_type, trigger_id, suggest_type, suggest_id, priority, reason_template, source)
values
  ('pizza', 'P1', 'topping', 'T9', 10, 'Extra Cheese makes Margherita richer while keeping its classic taste.', 'manual'),
  ('pizza', 'P2', 'topping', 'T10', 20, 'Sun-Dried Tomatoes make California Veggie feel more premium.', 'manual'),
  ('pizza', 'P3', 'topping', 'T7', 30, 'Button Mushrooms fit naturally with a vegetable-loaded Farm House pizza.', 'manual'),
  ('pizza', 'P4', 'topping', 'T8', 40, 'Peri-Peri Drizzle adds a spicy kick that works well with Paneer Tikka.', 'manual'),
  ('pizza', 'P5', 'topping', 'T3', 50, 'Black Olives match the Greek Mediterranean flavour profile.', 'manual'),
  ('pizza', 'P6', 'topping', 'T5', 60, 'Jalapenos add a spicy contrast to Pepperoni Classic.', 'manual'),
  ('pizza', 'P7', 'topping', 'T6', 70, 'Roasted Garlic adds depth to the BBQ Chicken flavour.', 'manual'),
  ('pizza', 'P8', 'topping', 'T9', 80, 'Extra Cheese works well with a rich Chicago Deep Dish style pizza.', 'manual'),
  ('pizza', 'P1', 'beverage', 'D1', 90, 'Cola is a simple drink pairing for a classic Margherita order.', 'manual'),
  ('pizza', 'P4', 'beverage', 'D2', 100, 'Masala Chaas balances the spice of Paneer Tikka.', 'manual')
on conflict do nothing;
