"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRequireAuth } from "@/components/staff/useRequireAuth";
import StaffHeader from "@/components/staff/StaffHeader";
import { formatINR } from "@/lib/pricing";
import type { OrderRow, UpsellEventRow } from "@/lib/types";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function hourLabel(h: number): string {
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12} ${suffix}`;
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-[var(--accent)]/40 bg-[var(--accent)]/10" : "border-white/10 bg-white/5"}`}>
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${accent ? "text-[var(--accent)]" : ""}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function Bar({ label, value, max, display }: { label: string; value: number; max: number; display: string }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-xs text-zinc-400">{label}</span>
      <div className="h-6 flex-1 overflow-hidden rounded-md bg-white/5">
        <div
          className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-[var(--accent)]/60 to-[var(--accent)] pr-2 text-[10px] font-semibold text-black transition-all"
          style={{ width: `${pct}%` }}
        >
          {display}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Segmented<T extends string | number | null>({
  options, value, onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            opt.value === value
              ? "bg-[var(--accent)] text-black"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface Analytics {
  ordersCount: number;
  revenue: number;
  aov: number;
  discountTotal: number;
  discountedCount: number;
  avgDiscountedTotal: number;
  avgRegularTotal: number;
  pizzaOverall: [string, number][];
  weekendTop: [string, number][];
  weekdayTop: [string, number][];
  byHour: number[];
  byDow: number[];
  payments: [string, number][];
  peakHour: number;
  peakDow: number;
  weekendShare: number;
  upsellShown: number;
  upsellAccepted: number;
  upsellRevenue: number;
}

function analyze(orders: OrderRow[], events: UpsellEventRow[]): Analytics {
  const pizzaOverall = new Map<string, number>();
  const weekend = new Map<string, number>();
  const weekday = new Map<string, number>();
  const byHour = new Array(24).fill(0);
  const byDow = new Array(7).fill(0);
  const payments = new Map<string, number>();

  let revenue = 0;
  let discountTotal = 0;
  let discountedCount = 0;
  let discountedRevenue = 0;
  let regularRevenue = 0;
  let weekendOrders = 0;

  for (const order of orders) {
    const total = Number(order.total);
    const discount = Number(order.discount);
    const date = new Date(order.created_at);
    const dow = date.getDay();
    const isWeekend = dow === 0 || dow === 6;

    revenue += total;
    byHour[date.getHours()] += 1;
    byDow[dow] += 1;
    if (isWeekend) weekendOrders += 1;
    payments.set(order.payment_mode, (payments.get(order.payment_mode) ?? 0) + 1);

    if (discount > 0) {
      discountTotal += discount;
      discountedCount += 1;
      discountedRevenue += total;
    } else {
      regularRevenue += total;
    }

    for (const item of order.order_items ?? []) {
      if (item.item_type !== "pizza") continue;
      const qty = Number(item.quantity);
      pizzaOverall.set(item.item_name, (pizzaOverall.get(item.item_name) ?? 0) + qty);
      const bucket = isWeekend ? weekend : weekday;
      bucket.set(item.item_name, (bucket.get(item.item_name) ?? 0) + qty);
    }
  }

  const sortDesc = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]);

  const upsellShown = events.length;
  const upsellAccepted = events.filter((e) => e.accepted === true).length;
  const upsellRevenue = events.reduce((sum, e) => sum + Number(e.revenue_impact ?? 0), 0);

  const ordersCount = orders.length;
  const regularCount = ordersCount - discountedCount;

  return {
    ordersCount,
    revenue,
    aov: ordersCount > 0 ? revenue / ordersCount : 0,
    discountTotal,
    discountedCount,
    avgDiscountedTotal: discountedCount > 0 ? discountedRevenue / discountedCount : 0,
    avgRegularTotal: regularCount > 0 ? regularRevenue / regularCount : 0,
    pizzaOverall: sortDesc(pizzaOverall).slice(0, 6),
    weekendTop: sortDesc(weekend).slice(0, 5),
    weekdayTop: sortDesc(weekday).slice(0, 5),
    byHour,
    byDow,
    payments: sortDesc(payments),
    peakHour: byHour.indexOf(Math.max(...byHour)),
    peakDow: byDow.indexOf(Math.max(...byDow)),
    weekendShare: ordersCount > 0 ? (weekendOrders / ordersCount) * 100 : 0,
    upsellShown,
    upsellAccepted,
    upsellRevenue,
  };
}

export default function AnalyticsPage() {
  const auth = useRequireAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [events, setEvents] = useState<UpsellEventRow[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [rangeDays, setRangeDays] = useState<number | null>(56);
  const [dayType, setDayType] = useState<"all" | "weekday" | "weekend">("all");

  const refresh = useCallback(() => {
    Promise.all([
      supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(2000),
      supabase.from("upsell_events").select("accepted, revenue_impact, created_at"),
    ]).then(([ordersRes, eventsRes]) => {
      if (ordersRes.error) {
        setLoadError(true);
        setLoaded(true);
        return;
      }
      setLoadError(false);
      setOrders(ordersRes.data as OrderRow[]);
      // upsell_events may not exist on older DBs — degrade gracefully.
      setEvents((eventsRes.error ? [] : eventsRes.data) as UpsellEventRow[]);
      setUpdatedAt(new Date());
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (auth !== "authed") return;
    refresh();
    // Live: refetch whenever a new order lands.
    const channel = supabase
      .channel("analytics")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [auth, refresh]);

  // Date-range + weekday/weekend filtering happens client-side so it feels instant.
  const filtered = useMemo(() => {
    const nowMs = updatedAt ? updatedAt.getTime() : 0;
    const cutoff = rangeDays && nowMs ? nowMs - rangeDays * 86_400_000 : 0;
    const keep = (ts: string) => {
      const d = new Date(ts);
      if (d.getTime() < cutoff) return false;
      if (dayType === "all") return true;
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      return dayType === "weekend" ? weekend : !weekend;
    };
    return {
      orders: orders.filter((o) => keep(o.created_at)),
      events: events.filter((e) => (e.created_at ? keep(e.created_at) : true)),
    };
  }, [orders, events, rangeDays, dayType, updatedAt]);

  const a = useMemo(() => analyze(filtered.orders, filtered.events), [filtered]);

  if (auth !== "authed") {
    return <p className="p-10 text-center text-zinc-400">Checking access…</p>;
  }

  const discountPaysOff = a.avgDiscountedTotal > a.avgRegularTotal;
  const acceptRate = a.upsellShown > 0 ? (a.upsellAccepted / a.upsellShown) * 100 : 0;
  const maxHour = Math.max(1, ...a.byHour);
  const maxDow = Math.max(1, ...a.byDow);
  const maxPizza = a.pizzaOverall[0]?.[1] ?? 1;
  const totalPayments = a.payments.reduce((s, [, n]) => s + n, 0);

  return (
    <main className="min-h-dvh">
      <StaffHeader title="Admin — Analytics" />
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        {/* Filters — feel-live controls */}
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value={rangeDays}
            onChange={setRangeDays}
            options={[
              { label: "7 days", value: 7 },
              { label: "30 days", value: 30 },
              { label: "8 weeks", value: 56 },
              { label: "All", value: null },
            ]}
          />
          <Segmented
            value={dayType}
            onChange={setDayType}
            options={[
              { label: "All days", value: "all" },
              { label: "Weekdays", value: "weekday" },
              { label: "Weekends", value: "weekend" },
            ]}
          />
          <div className="ml-auto flex items-center gap-3">
            {updatedAt && (
              <span className="text-xs text-zinc-500">
                Live · updated {updatedAt.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={refresh}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-[var(--accent)] hover:text-white"
            >
              Refresh
            </button>
          </div>
        </div>

        {loadError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            Couldn&apos;t load analytics — check the connection.{" "}
            <button onClick={refresh} className="underline">Retry</button>
          </div>
        )}

        {loaded && !loadError && a.ordersCount === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-zinc-400">
            {orders.length === 0
              ? "No orders yet — analytics will fill in as orders come in."
              : "No orders match these filters — widen the date range or day type."}
          </div>
        )}

        {a.ordersCount > 0 && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Revenue" value={formatINR(a.revenue)} sub={`${a.ordersCount} orders`} accent />
              <StatCard label="Avg order value" value={formatINR(a.aov)} />
              <StatCard label="Busiest hour" value={hourLabel(a.peakHour)} sub={`${a.byHour[a.peakHour]} orders placed`} />
              <StatCard label="Busiest day" value={DOW_LABELS[a.peakDow]} sub={`${a.byDow[a.peakDow]} orders`} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Top-selling pizzas" hint="Pizzas sold, by quantity">
                <div className="space-y-2">
                  {a.pizzaOverall.map(([name, qty]) => (
                    <Bar key={name} label={name} value={qty} max={maxPizza} display={String(qty)} />
                  ))}
                </div>
              </Panel>

              <Panel title="Walk-ins by hour" hint={`Peak: ${hourLabel(a.peakHour)}`}>
                <div className="flex h-40 gap-1">
                  {a.byHour.map((count, h) => (
                    <div key={h} className="flex h-full flex-1 flex-col justify-end" title={`${hourLabel(h)}: ${count}`}>
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-[var(--accent)]/40 to-[var(--accent)]"
                        style={{ height: `${count > 0 ? Math.max(6, (count / maxHour) * 100) : 0}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex gap-1">
                  {a.byHour.map((_, h) => (
                    <span key={h} className="flex-1 text-center text-[8px] text-zinc-500">
                      {h % 3 === 0 ? h : ""}
                    </span>
                  ))}
                </div>
              </Panel>

              <Panel title="Weekend best-sellers" hint="What sells Sat &amp; Sun">
                <div className="space-y-2">
                  {a.weekendTop.length > 0 ? (
                    a.weekendTop.map(([name, qty]) => (
                      <Bar key={name} label={name} value={qty} max={a.weekendTop[0][1]} display={String(qty)} />
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500">No weekend orders yet.</p>
                  )}
                </div>
              </Panel>

              <Panel title="Weekday best-sellers" hint="What sells Mon–Fri">
                <div className="space-y-2">
                  {a.weekdayTop.length > 0 ? (
                    a.weekdayTop.map(([name, qty]) => (
                      <Bar key={name} label={name} value={qty} max={a.weekdayTop[0][1]} display={String(qty)} />
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500">No weekday orders yet.</p>
                  )}
                </div>
              </Panel>

              <Panel title="Orders by weekday">
                <div className="space-y-2">
                  {a.byDow.map((count, dow) => (
                    <Bar key={dow} label={DOW_LABELS[dow]} value={count} max={maxDow} display={String(count)} />
                  ))}
                </div>
              </Panel>

              <Panel title="Payment mix" hint={`${a.weekendShare.toFixed(0)}% of orders land on weekends`}>
                <div className="space-y-2">
                  {a.payments.map(([mode, count]) => (
                    <Bar
                      key={mode}
                      label={mode.toUpperCase()}
                      value={count}
                      max={a.payments[0][1]}
                      display={`${count} · ${totalPayments > 0 ? Math.round((count / totalPayments) * 100) : 0}%`}
                    />
                  ))}
                </div>
              </Panel>
            </div>

            {/* Discount policy verdict */}
            <Panel
              title="Is the bulk discount worth it?"
              hint="10% off on 5+ pizzas — does it pull bigger baskets or just give away margin?"
            >
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Discount given away" value={formatINR(a.discountTotal)} sub={`${a.discountedCount} discounted orders`} />
                <StatCard label="Avg discounted basket" value={formatINR(a.avgDiscountedTotal)} sub="after discount" />
                <StatCard label="Avg regular basket" value={formatINR(a.avgRegularTotal)} />
                <StatCard
                  label="Verdict"
                  value={discountPaysOff ? "Paying off" : "Costing you"}
                  sub={
                    discountPaysOff
                      ? `Bulk baskets run ${formatINR(a.avgDiscountedTotal - a.avgRegularTotal)} bigger`
                      : `Bulk baskets run ${formatINR(a.avgRegularTotal - a.avgDiscountedTotal)} smaller`
                  }
                  accent={discountPaysOff}
                />
              </div>
              <p className="mt-4 text-xs text-zinc-500">
                {discountPaysOff
                  ? "Discounted orders are larger on average even after the markdown — the deal is pulling group orders that beat a normal basket. Keep it."
                  : "Discounted orders aren't out-earning regular ones after the markdown — the 10% is trimming margin without lifting basket size. Consider raising the threshold or trimming the rate."}
              </p>
            </Panel>

            {/* Upsell performance */}
            <Panel title="Smart upsell performance" hint="How the AI add-on suggestions are landing">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Suggestions shown" value={String(a.upsellShown)} />
                <StatCard label="Accepted" value={String(a.upsellAccepted)} />
                <StatCard label="Accept rate" value={`${acceptRate.toFixed(0)}%`} accent={acceptRate >= 25} />
                <StatCard label="Extra revenue" value={formatINR(a.upsellRevenue)} sub="from accepted add-ons" />
              </div>
            </Panel>
          </>
        )}
      </div>
    </main>
  );
}
