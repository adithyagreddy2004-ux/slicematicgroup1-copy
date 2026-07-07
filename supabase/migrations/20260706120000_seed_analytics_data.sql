-- Seed historical orders + upsell events so the admin analytics dashboard has
-- meaningful insights on a fresh database (demo day).
--
-- Idempotent-ish: skips if the DB already holds a real order history (>40 orders),
-- so it never doubles up on reseed and never buries real production data.
--
-- Patterns baked into the data on purpose (so the dashboard actually shows something):
--   * Weekends (Sat/Sun) skew toward premium/meaty pizzas (Pepperoni, BBQ, Deep Dish)
--     and larger group orders → more discount-triggering baskets.
--   * Order times cluster around a lunch peak (12–14) and a dinner peak (19–22).
--   * ~1 in 6 baskets is 5+ pizzas → triggers the 10% bulk discount.
--   * Upsell events run at a realistic ~40% acceptance rate.

do $$
declare
  i              int;
  v_order_id     uuid;
  v_created      timestamptz;
  v_dow          int;
  v_hour         int;
  v_qty          int;
  v_base         record;
  v_pizza        record;
  v_pizza_id     text;
  v_top_ids      text[];
  v_bev_ids      text[];
  v_top_sum      numeric := 0;
  v_bev_sum      numeric := 0;
  v_unit         numeric;
  v_subtotal     numeric;
  v_discount     numeric;
  v_gst          numeric;
  v_total        numeric;
  v_payment      text;
  v_status       text;
  v_name         text;
  v_table        text;
  n_top          int;
  n_bev          int;
  t_id           text;
  b_id           text;
  b_name         text;
  b_price        numeric;
  v_accepted     boolean;
  weekend        boolean;
  -- lunch + dinner weighted hour pool
  hours          int[] := array[11,12,12,12,13,13,13,14,14,15,17,18,19,19,20,20,20,21,21,21,22,22,23,13,20];
  payments       text[] := array['upi','upi','upi','upi','card','card','cash','cash'];
  weekend_pizzas text[] := array['P6','P7','P8','P6','P7','P8','P4'];
  weekday_pizzas text[] := array['P1','P2','P3','P4','P1','P5','P2','P3'];
  names          text[] := array[
    'Aarav Sharma','Diya Patel','Vivaan Reddy','Ananya Nair','Aditya Rao','Isha Gupta',
    'Kabir Singh','Meera Iyer','Rohan Das','Sara Khan','Arjun Mehta','Priya Kapoor',
    'Neha Joshi','Rahul Verma','Tara Menon','Karan Malhotra','Sneha Pillai','Yash Agarwal',
    'Riya Bhat','Dev Chauhan','Nikhil Shetty','Pooja Bhalla','Aman Sethi','Kavya Ramesh'];
begin
  -- Guard: only seed a fresh / demo database.
  if (select count(*) from orders) > 40 then
    raise notice 'analytics seed skipped — orders table already populated';
    return;
  end if;

  for i in 1..240 loop
    -- Random day within the last 8 weeks, then snap to a weighted hour.
    v_created := now() - ((random() * 56)::int || ' days')::interval;
    v_dow     := extract(dow from v_created)::int;   -- 0 = Sunday .. 6 = Saturday
    weekend   := v_dow in (0, 6);
    v_hour    := hours[1 + floor(random() * array_length(hours, 1))::int];
    v_created := date_trunc('day', v_created)
                 + (v_hour || ' hours')::interval
                 + (floor(random() * 60) || ' minutes')::interval;

    -- Pizza pick, with weekend / weekday bias (30% pure-random for spread).
    if random() < 0.30 then
      select id into v_pizza_id from pizzas order by random() limit 1;
    elsif weekend then
      v_pizza_id := weekend_pizzas[1 + floor(random() * array_length(weekend_pizzas, 1))::int];
    else
      v_pizza_id := weekday_pizzas[1 + floor(random() * array_length(weekday_pizzas, 1))::int];
    end if;

    select id, name, price into v_pizza from pizzas where id = v_pizza_id;
    select id, name, price into v_base  from bases order by random() limit 1;

    -- Quantity: usually 1–3; weekends more likely to hit the 5+ bulk-discount tier.
    if random() < (case when weekend then 0.30 else 0.13 end) then
      v_qty := 5 + floor(random() * 4)::int;   -- 5..8
    else
      v_qty := 1 + floor(random() * 3)::int;   -- 1..3
    end if;

    -- Toppings 0–3, beverages 0–2.
    n_top := floor(random() * 4)::int;
    n_bev := floor(random() * 3)::int;

    select array_agg(id), coalesce(sum(price), 0)
      into v_top_ids, v_top_sum
      from (select id, price from toppings order by random() limit n_top) s;
    select array_agg(id), coalesce(sum(price), 0)
      into v_bev_ids, v_bev_sum
      from (select id, price from beverages order by random() limit n_bev) s;

    v_top_sum := coalesce(v_top_sum, 0);
    v_bev_sum := coalesce(v_bev_sum, 0);

    -- Money — mirrors lib/pricing.ts exactly (bulk discount 10% at qty >= 5, GST 18%).
    v_unit     := v_base.price + v_pizza.price + v_top_sum;
    v_subtotal := round(v_unit * v_qty + v_bev_sum, 2);
    v_discount := case when v_qty >= 5 then round(v_subtotal * 0.10, 2) else 0 end;
    v_gst      := round((v_subtotal - v_discount) * 0.18, 2);
    v_total    := round(v_subtotal - v_discount + v_gst, 2);

    v_payment := payments[1 + floor(random() * array_length(payments, 1))::int];
    v_name    := names[1 + floor(random() * array_length(names, 1))::int];
    v_table   := (1 + floor(random() * 15)::int)::text;

    -- Very recent orders may still be in flight; older ones are done.
    if v_created > now() - interval '2 hours' then
      v_status := (array['received','preparing','ready'])[1 + floor(random() * 3)::int];
    else
      v_status := 'ready';
    end if;

    v_order_id := gen_random_uuid();

    insert into orders
      (id, customer_name, phone, table_id, subtotal, discount, gst, total, payment_mode, status, created_at)
    values
      (v_order_id, v_name, '90000' || lpad((10000 + i)::text, 5, '0'),
       v_table, v_subtotal, v_discount, v_gst, v_total, v_payment, v_status, v_created);

    -- Line items (base + pizza + toppings carry the pizza quantity; beverages are one each).
    insert into order_items (order_id, item_type, item_id, item_name, unit_price, quantity)
    values (v_order_id, 'base',  v_base.id,  v_base.name,  v_base.price,  v_qty),
           (v_order_id, 'pizza', v_pizza.id, v_pizza.name, v_pizza.price, v_qty);

    if v_top_ids is not null then
      foreach t_id in array v_top_ids loop
        insert into order_items (order_id, item_type, item_id, item_name, unit_price, quantity)
        select v_order_id, 'topping', tp.id, tp.name, tp.price, v_qty from toppings tp where tp.id = t_id;
      end loop;
    end if;

    if v_bev_ids is not null then
      foreach b_id in array v_bev_ids loop
        insert into order_items (order_id, item_type, item_id, item_name, unit_price, quantity)
        select v_order_id, 'beverage', bv.id, bv.name, bv.price, 1 from beverages bv where bv.id = b_id;
      end loop;
    end if;

    -- Upsell: ~55% of orders saw a suggestion; ~40% of those were accepted.
    if random() < 0.55 then
      if random() < 0.5 then
        select id, name, price into b_id, b_name, b_price from toppings order by random() limit 1;
      else
        select id, name, price into b_id, b_name, b_price from beverages order by random() limit 1;
      end if;

      v_accepted := random() < 0.40;

      insert into upsell_events
        (order_id, rule_id, cart_signature, suggested_type, suggested_id, suggested_name,
         suggested_price, ai_message, displayed, accepted, quantity, revenue_impact, created_at, updated_at)
      values
        (v_order_id, null, v_pizza.id || '|seed',
         case when b_id like 'T%' then 'topping' else 'beverage' end,
         b_id, b_name, b_price,
         b_name || ' pairs nicely with your ' || v_pizza.name || '.',
         true,
         v_accepted,
         v_qty,
         case when v_accepted then b_price else 0 end,
         v_created, v_created);
    end if;
  end loop;
end $$;
