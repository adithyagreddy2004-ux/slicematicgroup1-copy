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
