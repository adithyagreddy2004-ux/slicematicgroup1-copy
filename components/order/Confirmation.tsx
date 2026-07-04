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
