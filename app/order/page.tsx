"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { OrderProvider, useOrder } from "@/components/order/OrderContext";
import LoginForm from "@/components/order/LoginForm";
import TablePicker from "@/components/order/TablePicker";
import MenuBuilder from "@/components/order/MenuBuilder";
import PaymentSelect from "@/components/order/PaymentSelect";
import Confirmation from "@/components/order/Confirmation";
import CallWaiterButton from "@/components/order/CallWaiterButton";
import { validateTableId } from "@/lib/validation";

function Steps() {
  const { step } = useOrder();
  const showBar = step !== "login";
  return (
    <main className="min-h-dvh">
      {/* Top assist bar — Call Waiter (+ Mood matcher, mounted by MenuBuilder)
          sit on one line here so the flow starts below them, never overlapping. */}
      {showBar && (
        <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-white/10 bg-black/70 px-3 backdrop-blur-xl">
          <CallWaiterButton />
        </div>
      )}
      <div className={showBar ? "pt-14" : ""}>
        <AnimatePresence mode="wait">
          {step === "login" && <LoginForm key="login" />}
          {step === "menu" && <MenuBuilder key="menu" />}
          {step === "payment" && <PaymentSelect key="payment" />}
          {step === "confirmed" && <Confirmation key="confirmed" />}
        </AnimatePresence>
      </div>
    </main>
  );
}

function OrderFlow() {
  const params = useSearchParams();
  const rawTable = params.get("table") ?? "";
  if (!validateTableId(rawTable).ok) return <TablePicker />;
  return (
    <OrderProvider tableId={rawTable.trim()}>
      <Steps />
    </OrderProvider>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={null}>
      <OrderFlow />
    </Suspense>
  );
}
