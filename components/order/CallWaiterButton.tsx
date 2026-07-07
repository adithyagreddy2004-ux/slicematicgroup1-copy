"use client";

import { useState } from "react";
import { useOrder } from "./OrderContext";

type CallState = "idle" | "calling" | "called" | "error";

export default function CallWaiterButton() {
  const { tableId } = useOrder();
  const [state, setState] = useState<CallState>("idle");

  async function callWaiter() {
    if (state === "calling" || state === "called") return;
    setState("calling");
    try {
      const res = await fetch("/api/waiter-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId }),
      });
      if (!res.ok) throw new Error();
      setState("called");
      setTimeout(() => setState("idle"), 5000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 5000);
    }
  }

  const label =
    state === "calling" ? "Calling…"
    : state === "called" ? "Waiter on the way ✓"
    : state === "error" ? "Failed — tap to retry"
    : "🛎 Call waiter";

  return (
    <button
      onClick={callWaiter}
      className={`fixed right-3 top-3 z-50 rounded-full px-4 py-2 text-xs font-semibold shadow-lg backdrop-blur transition ${
        state === "called"
          ? "bg-emerald-500 text-black"
          : state === "error"
          ? "bg-red-500 text-white"
          : "border border-white/15 bg-black/60 text-white hover:border-[var(--accent)]"
      }`}
    >
      {label}
    </button>
  );
}
