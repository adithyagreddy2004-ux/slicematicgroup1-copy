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
  return (
    <main className="min-h-dvh">
      <AnimatePresence mode="wait">
        {step === "login" && <LoginForm key="login" />}
        {step === "menu" && <MenuBuilder key="menu" />}
        {step === "payment" && <PaymentSelect key="payment" />}
        {step === "confirmed" && <Confirmation key="confirmed" />}
      </AnimatePresence>
      {step !== "login" && <CallWaiterButton />}
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
