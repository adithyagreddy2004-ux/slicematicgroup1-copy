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

  const refresh = useCallback(() => {
    Promise.all([
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
    ]).then(([ordersRes, callsRes]) => {
      if (ordersRes.error || callsRes.error) {
        setLoadError(true);
        return;
      }
      setLoadError(false);
      setOrders(ordersRes.data as OrderRow[]);
      setCalls(callsRes.data as WaiterCallRow[]);
    });
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
