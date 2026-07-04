"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useOrder } from "./OrderContext";
import BillLines from "./BillLines";
import { supabase } from "@/lib/supabase/client";
import { computeBill, formatINR } from "@/lib/pricing";
import { validateQuantity } from "@/lib/validation";
import type { Menu, MenuItem } from "@/lib/types";

type LoadState = "loading" | "error" | "ready";

function SelectableCard({
  item, selected, onSelect,
}: { item: MenuItem; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left backdrop-blur transition ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent)]/10"
          : "border-white/10 bg-white/5 hover:border-white/30"
      }`}
    >
      <span>{item.name}</span>
      <span className="text-sm text-zinc-400">{formatINR(Number(item.price))}</span>
    </button>
  );
}

export default function MenuBuilder() {
  const {
    customerName, baseId, setBaseId, pizzaId, setPizzaId,
    toppingIds, toggleTopping, quantity, setQuantity, setStep,
  } = useOrder();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [qtyInput, setQtyInput] = useState(String(quantity));
  const [qtyError, setQtyError] = useState<string | null>(null);

  const loadMenu = useCallback(() => {
    Promise.all([
      supabase.from("bases").select("id,name,price").order("price"),
      supabase.from("pizzas").select("id,name,price").order("price"),
      supabase.from("toppings").select("id,name,price").order("price"),
    ]).then(([bases, pizzas, toppings]) => {
      if (bases.error || pizzas.error || toppings.error) {
        setLoadState("error");
        return;
      }
      setMenu({ bases: bases.data, pizzas: pizzas.data, toppings: toppings.data });
      setLoadState("ready");
    });
  }, []);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  function retryLoad() {
    setLoadState("loading");
    loadMenu();
  }

  function handleQtyChange(raw: string) {
    setQtyInput(raw);
    const check = validateQuantity(raw);
    if (check.ok) {
      setQuantity(Number(raw.trim()));
      setQtyError(null);
    } else {
      setQtyError(check.error);
    }
  }

  const bill = useMemo(() => {
    if (!menu || !baseId || !pizzaId || qtyError) return null;
    const base = menu.bases.find((b) => b.id === baseId);
    const pizza = menu.pizzas.find((p) => p.id === pizzaId);
    if (!base || !pizza) return null;
    const toppingPrices = menu.toppings
      .filter((t) => toppingIds.includes(t.id))
      .map((t) => Number(t.price));
    return computeBill({
      basePrice: Number(base.price),
      pizzaPrice: Number(pizza.price),
      toppingPrices,
      quantity,
    });
  }, [menu, baseId, pizzaId, toppingIds, quantity, qtyError]);

  if (loadState === "loading") {
    return <p className="p-10 text-center text-zinc-400">Loading menu…</p>;
  }
  if (loadState === "error" || !menu) {
    return (
      <div className="p-10 text-center">
        <p className="mb-4 text-zinc-300">Couldn&apos;t load the menu. Check your connection.</p>
        <button onClick={retryLoad} className="rounded-xl bg-[var(--accent)] px-6 py-2 font-semibold text-black">
          Retry
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      className="mx-auto w-full max-w-md space-y-8 p-6 pb-44"
    >
      <h2 className="text-2xl font-bold">Build your pizza, {customerName.split(" ")[0]}</h2>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">1 · Choose a base</h3>
        <div className="space-y-2">
          {menu.bases.map((item) => (
            <SelectableCard key={item.id} item={item} selected={baseId === item.id} onSelect={() => setBaseId(item.id)} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">2 · Choose a pizza</h3>
        <div className="space-y-2">
          {menu.pizzas.map((item) => (
            <SelectableCard key={item.id} item={item} selected={pizzaId === item.id} onSelect={() => setPizzaId(item.id)} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">3 · Toppings (optional)</h3>
        <div className="space-y-2">
          {menu.toppings.map((item) => (
            <SelectableCard key={item.id} item={item} selected={toppingIds.includes(item.id)} onSelect={() => toggleTopping(item.id)} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">4 · How many?</h3>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleQtyChange(String(Math.max(1, quantity - 1)))}
            className="h-12 w-12 rounded-xl border border-white/10 bg-white/5 text-xl"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <input
            value={qtyInput}
            onChange={(e) => handleQtyChange(e.target.value)}
            inputMode="numeric"
            aria-label="Quantity"
            className="h-12 w-20 rounded-xl border border-white/10 bg-white/5 text-center text-lg outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => handleQtyChange(String(Math.min(10, quantity + 1)))}
            className="h-12 w-12 rounded-xl border border-white/10 bg-white/5 text-xl"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
        {qtyError && <p className="mt-2 text-sm text-red-400">{qtyError}</p>}
        <p className="mt-2 text-xs text-zinc-500">Order 5 or more and get 10% off automatically.</p>
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-black/70 p-4 backdrop-blur-xl">
        <div className="mx-auto max-w-md">
          {bill ? (
            <>
              <BillLines bill={bill} quantity={quantity} />
              <button
                onClick={() => setStep("payment")}
                className="mt-3 w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-black"
              >
                Continue to payment
              </button>
            </>
          ) : (
            <p className="py-2 text-center text-sm text-zinc-400">
              {qtyError ? "Fix the quantity to continue." : "Pick a base and a pizza to see your bill."}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
