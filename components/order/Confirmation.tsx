"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOrder } from "./OrderContext";
import BillLines from "./BillLines";

const MODE_LABELS: Record<string, string> = { cash: "Cash", card: "Card", upi: "UPI" };

// Customer-facing theater. The kitchen controls the real order status;
// this sequence just makes the wait feel alive.
type Stage = "sent" | "oven" | "delivering" | "served";

const STAGE_COPY: Record<Stage, { title: string; sub: string }> = {
  sent: { title: "Order beamed to the kitchen", sub: "Rajan's crew just got pinged…" },
  oven: { title: "In the oven", sub: "450° of pure business." },
  delivering: { title: "Out of the oven!", sub: "Gliding to your table…" },
  served: { title: "Order locked in", sub: "Sit tight — it's on its way." },
};

function MiniPizza({ size = 64 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size}>
      <circle cx="32" cy="32" r="28" fill="#c98a4b" />
      <circle cx="32" cy="32" r="23" fill="#f7d060" />
      <circle cx="24" cy="26" r="4" fill="#d63c35" />
      <circle cx="40" cy="24" r="4" fill="#d63c35" />
      <circle cx="30" cy="40" r="4" fill="#d63c35" />
      <circle cx="42" cy="38" r="3" fill="#22c55e" />
    </svg>
  );
}

function OvenScene() {
  return (
    <div className="relative mx-auto flex h-36 w-48 flex-col items-center justify-end">
      {/* oven shell */}
      <div className="absolute inset-x-0 top-0 h-28 rounded-2xl border border-white/15 bg-white/5" />
      {/* glowing mouth */}
      <div className="absolute inset-x-4 top-4 flex h-20 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-[#2a0e02] to-[#571c04] shadow-[inset_0_0_30px_rgba(255,120,30,0.55)]">
        <motion.div
          initial={{ y: 48, scale: 0.6 }}
          animate={{ y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 160, damping: 16 }}
        >
          <motion.div
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            className="drop-shadow-[0_0_18px_rgba(255,140,40,0.8)]"
          >
            <MiniPizza size={56} />
          </motion.div>
        </motion.div>
      </div>
      {/* flames */}
      <div className="relative z-10 -mt-1 flex gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="flame inline-block h-5 w-3 rounded-full bg-gradient-to-t from-orange-600 via-amber-400 to-yellow-200"
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function DeliveryScene({ tableId }: { tableId: string }) {
  return (
    <div className="relative mx-auto h-36 w-full max-w-xs">
      {/* dashed track */}
      <div className="absolute inset-x-2 top-1/2 border-t-2 border-dashed border-white/15" />
      {/* destination table badge */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 rounded-xl border border-[var(--accent)]/50 bg-black/60 px-3 py-2 text-center shadow-[0_0_18px_rgba(255,92,26,0.35)]">
        <p className="text-[10px] uppercase tracking-widest text-zinc-400">Table</p>
        <p className="text-lg font-bold text-[var(--accent)]">{tableId}</p>
      </div>
      {/* pizza glides in */}
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 150, opacity: 1 }}
        transition={{ duration: 2.2, ease: "easeInOut" }}
        className="absolute left-0 top-1/2 -translate-y-1/2"
      >
        <motion.div
          animate={{ y: [-3, 3, -3] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
          className="drop-shadow-[0_10px_16px_rgba(255,120,30,0.4)]"
        >
          <MiniPizza size={52} />
        </motion.div>
      </motion.div>
    </div>
  );
}

function ServedScene() {
  return (
    <div className="relative mx-auto flex h-36 w-36 items-center justify-center">
      {/* burst sparks */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(angle) * 58,
              y: Math.sin(angle) * 58,
              opacity: 0,
              scale: 0.3,
            }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className="absolute h-2 w-2 rounded-full bg-[var(--accent)]"
          />
        );
      })}
      <motion.div
        initial={{ scale: 0.4 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 16 }}
      >
        <MiniPizza size={88} />
      </motion.div>
      <motion.svg
        viewBox="0 0 40 40"
        className="absolute -bottom-1 -right-1 h-10 w-10"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 400, damping: 18 }}
      >
        <circle cx="20" cy="20" r="18" fill="#10b981" />
        <motion.path
          d="M 12 20 L 18 26 L 29 14"
          fill="none"
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.45, duration: 0.3 }}
        />
      </motion.svg>
    </div>
  );
}

function RadarPing() {
  return (
    <div className="relative mx-auto flex h-36 w-36 items-center justify-center">
      {[0, 0.5, 1].map((delay) => (
        <motion.span
          key={delay}
          initial={{ scale: 0.3, opacity: 0.8 }}
          animate={{ scale: 2.2, opacity: 0 }}
          transition={{ duration: 1.6, delay, repeat: Infinity, ease: "easeOut" }}
          className="absolute h-16 w-16 rounded-full border-2 border-[var(--accent)]"
        />
      ))}
      <span className="text-4xl">📡</span>
    </div>
  );
}

const STAGE_ORDER: Stage[] = ["sent", "oven", "delivering", "served"];

export default function Confirmation() {
  const { customerName, tableId, orderId, confirmedBill, quantity, paymentMode, startNewOrder } = useOrder();
  const [stage, setStage] = useState<Stage>("sent");

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage("oven"), 1600),
      setTimeout(() => setStage("delivering"), 5200),
      setTimeout(() => setStage("served"), 7800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const copy = STAGE_COPY[stage];
  const stageIndex = STAGE_ORDER.indexOf(stage);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto w-full max-w-md p-6"
    >
      {/* journey theater */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <AnimatePresence mode="wait">
          <motion.div
            key={stage}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3 }}
          >
            {stage === "sent" && <RadarPing />}
            {stage === "oven" && <OvenScene />}
            {stage === "delivering" && <DeliveryScene tableId={tableId} />}
            {stage === "served" && <ServedScene />}
            <h2 className="mt-4 text-center text-xl font-bold">{copy.title}</h2>
            <p className="mt-1 text-center text-sm text-zinc-400">{copy.sub}</p>
          </motion.div>
        </AnimatePresence>

        {/* progress nodes */}
        <div className="mt-6 flex items-center justify-center gap-0">
          {STAGE_ORDER.map((s, i) => (
            <div key={s} className="flex items-center">
              {i > 0 && (
                <span
                  className={`h-px w-8 transition-colors duration-500 ${
                    i <= stageIndex ? "bg-[var(--accent)]" : "bg-white/15"
                  }`}
                />
              )}
              <span
                className={`h-2.5 w-2.5 rounded-full transition-all duration-500 ${
                  i <= stageIndex
                    ? "bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]"
                    : "bg-white/15"
                }`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* receipt */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur"
      >
        <div className="mb-4 text-center">
          <h3 className="text-lg font-bold text-emerald-400">Order confirmed</h3>
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

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        whileTap={{ scale: 0.97 }}
        onClick={startNewOrder}
        className="glow-button mt-4 w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-black"
      >
        Order another pizza 🍕
      </motion.button>
    </motion.div>
  );
}
