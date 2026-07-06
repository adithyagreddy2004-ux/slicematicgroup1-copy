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

  const refresh = useCallback(() => {
    Promise.all([
      supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(2000),
      supabase.from("upsell_events").select("accepted, revenue_impact"),
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
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (auth !== "authed") return;
    refresh();
  }, [auth, refresh]);

  const a = useMemo(() => analyze(orders, events), [orders, events]);

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
        {loadError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            Couldn&apos;t load analytics — check the connection.{" "}
            <button onClick={refresh} className="underline">Retry</button>
          </div>
        )}

        {loaded && !loadError && a.ordersCount === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-zinc-400">
            No orders yet — analytics will fill in as orders come in.
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
              <Panel title="Top-selling pizzas" hint="Pizzas sold (by quantity), all time">
                <div className="space-y-2">
                  {a.pizzaOverall.map(([name, qty]) => (
                    <Bar key={name} label={name} value={qty} max={maxPizza} display={String(qty)} />
                  ))}
                </div>
              </Panel>

              <Panel title="Walk-ins by hour" hint={`Peak: ${hourLabel(a.peakHour)}`}>
                <div className="flex h-40 items-end gap-1">
                  {a.byHour.map((count, h) => (
                    <div key={h} className="flex flex-1 flex-col items-center gap-1" title={`${hourLabel(h)}: ${count}`}>
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-[var(--accent)]/40 to-[var(--accent)]"
                        style={{ height: `${(count / maxHour) * 100}%` }}
                      />
                      {h % 3 === 0 && <span className="text-[8px] text-zinc-500">{h}</span>}
                    </div>
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
