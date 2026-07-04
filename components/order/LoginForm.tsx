"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useOrder } from "./OrderContext";
import { validateName, validatePhone } from "@/lib/validation";

export default function LoginForm() {
  const { tableId, customerName, setCustomerName, phone, setPhone, setStep } = useOrder();
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nameCheck = validateName(customerName);
    const phoneCheck = validatePhone(phone);
    setNameError(nameCheck.ok ? null : nameCheck.error);
    setPhoneError(phoneCheck.ok ? null : phoneCheck.error);
    if (nameCheck.ok && phoneCheck.ok) {
      setCustomerName(customerName.trim());
      setStep("menu");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      className="mx-auto w-full max-w-md p-6"
    >
      <p className="mb-1 text-sm text-zinc-400">Table {tableId}</p>
      <h1 className="mb-8 text-3xl font-bold">
        Welcome to Slice<span className="text-[var(--accent)]">Matic</span>
      </h1>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm text-zinc-300">Your name</label>
          <input
            id="name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="e.g. Rajan Sharma"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none backdrop-blur focus:border-[var(--accent)]"
          />
          {nameError && <p className="mt-1 text-sm text-red-400">{nameError}</p>}
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-sm text-zinc-300">Phone number</label>
          <input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile number"
            inputMode="numeric"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none backdrop-blur focus:border-[var(--accent)]"
          />
          {phoneError && <p className="mt-1 text-sm text-red-400">{phoneError}</p>}
        </div>
        <button
          type="submit"
          className="w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-black transition hover:brightness-110"
        >
          Start ordering
        </button>
      </form>
    </motion.div>
  );
}
