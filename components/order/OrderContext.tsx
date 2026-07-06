"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import type { Bill } from "@/lib/pricing";
import type { PaymentMode } from "@/lib/validation";

export type Step = "login" | "menu" | "payment" | "confirmed";

interface OrderState {
  step: Step;
  setStep: (s: Step) => void;
  tableId: string;
  customerName: string;
  setCustomerName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  baseId: string | null;
  setBaseId: (v: string | null) => void;
  pizzaId: string | null;
  setPizzaId: (v: string | null) => void;
  toppingIds: string[];
  toggleTopping: (id: string) => void;
  beverageIds: string[];
  toggleBeverage: (id: string) => void;
  quantity: number;
  setQuantity: (v: number) => void;
  paymentMode: PaymentMode | null;
  setPaymentMode: (v: PaymentMode | null) => void;
  orderId: string | null;
  setOrderId: (v: string | null) => void;
  acceptedUpsellEventId: string | null;
  setAcceptedUpsellEventId: (v: string | null) => void;
  confirmedBill: Bill | null;
  setConfirmedBill: (v: Bill | null) => void;
  startNewOrder: () => void;
}

const OrderContext = createContext<OrderState | null>(null);

export function OrderProvider({ tableId, children }: { tableId: string; children: ReactNode }) {
  const [step, setStep] = useState<Step>("login");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [baseId, setBaseId] = useState<string | null>(null);
  const [pizzaId, setPizzaId] = useState<string | null>(null);
  const [toppingIds, setToppingIds] = useState<string[]>([]);
  const [beverageIds, setBeverageIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [acceptedUpsellEventId, setAcceptedUpsellEventId] = useState<string | null>(null);
  const [confirmedBill, setConfirmedBill] = useState<Bill | null>(null);

  const toggleTopping = (id: string) =>
    setToppingIds((current) =>
      current.includes(id) ? current.filter((t) => t !== id) : [...current, id]
    );

  // Same guest, fresh cart — jumps straight back to the menu.
  const startNewOrder = () => {
    setBaseId(null);
    setPizzaId(null);
    setToppingIds([]);
    setBeverageIds([]);
    setQuantity(1);
    setPaymentMode(null);
    setOrderId(null);
    setAcceptedUpsellEventId(null);
    setConfirmedBill(null);
    setStep("menu");
  };

  const toggleBeverage = (id: string) =>
    setBeverageIds((current) =>
      current.includes(id) ? current.filter((b) => b !== id) : [...current, id]
    );

  return (
    <OrderContext.Provider
      value={{
        step, setStep, tableId,
        customerName, setCustomerName, phone, setPhone,
        baseId, setBaseId, pizzaId, setPizzaId,
        toppingIds, toggleTopping, beverageIds, toggleBeverage, quantity, setQuantity,
        paymentMode, setPaymentMode,
        orderId, setOrderId, acceptedUpsellEventId, setAcceptedUpsellEventId,
        confirmedBill, setConfirmedBill,
        startNewOrder,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export function useOrder(): OrderState {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrder must be used inside OrderProvider");
  return ctx;
}
