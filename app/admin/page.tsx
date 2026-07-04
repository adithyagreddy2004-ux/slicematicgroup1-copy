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

  const refresh = useCallback(() => {
    supabase
      .from("orders")
      .select("*, order_items(*)")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) {
          setLoadError(true);
          return;
        }
        setLoadError(false);
        setOrders(data as OrderRow[]);
      });
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
