"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOrder } from "./OrderContext";
import BillLines from "./BillLines";
import MoodRecommender from "./MoodRecommender";
import PizzaCanvas from "./PizzaCanvas";
import { useUpsell } from "./useUpsell";
import { supabase } from "@/lib/supabase/client";
import { computeBill, formatINR } from "@/lib/pricing";
import { validateQuantity } from "@/lib/validation";
import type { Menu, MenuItem } from "@/lib/types";
import type { MoodItemType } from "@/lib/mood";

type LoadState = "loading" | "error" | "ready";

function SelectableCard({
  item, selected, onSelect,
}: { item: MenuItem; selected: boolean; onSelect: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileTap={{ scale: 0.95 }}
      animate={selected ? { scale: [1, 1.04, 1] } : {}}
      transition={{ duration: 0.25 }}
      className={`flex w-full items-center justify-between gap-2 overflow-hidden rounded-xl border px-4 py-3 text-left backdrop-blur transition-colors ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent)]/15 shadow-[0_0_22px_-4px_var(--accent)]"
          : "border-white/10 bg-white/5 hover:border-white/30"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full transition ${
            selected ? "bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" : "bg-white/20"
          }`}
        />
        <span className="truncate">{item.name}</span>
      </span>
      <span className={`shrink-0 text-sm ${selected ? "text-[var(--accent)]" : "text-zinc-400"}`}>
        {formatINR(Number(item.price))}
      </span>
    </motion.button>
  );
}

function SectionHeading({
  n, label, done, hint, recommendation,
}: { n: number; label: string; done: boolean; hint?: string; recommendation?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold transition ${
          done
            ? "border-[var(--accent)] bg-[var(--accent)] text-black shadow-[0_0_12px_var(--accent)]"
            : "border-white/20 text-zinc-400"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">{label}</h3>
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
      {recommendation}
    </div>
  );
}

// Inline, contextual add-on nudge shown next to the relevant section heading.
function RecommendationChip({
  item, message, onAdd, onSkip,
}: { item: MenuItem; message: string; onAdd: () => void; onSkip: () => void }) {
  return (
    <motion.span
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 py-1 pl-2 pr-1"
    >
      <span className="text-[10px]">✨</span>
      <span className="max-w-[9rem] truncate text-xs font-medium text-zinc-100" title={message}>
        {item.name}
      </span>
      <span className="text-[10px] text-zinc-400">{formatINR(Number(item.price))}</span>
      <button
        type="button"
        onClick={onAdd}
        className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-black"
      >
        Add
      </button>
      <button
        type="button"
        onClick={onSkip}
        aria-label="Dismiss suggestion"
        className="px-1 text-xs leading-none text-zinc-400 hover:text-white"
      >
        ×
      </button>
    </motion.span>
  );
}

export default function MenuBuilder() {
  const {
    customerName, baseId, setBaseId, pizzaId, setPizzaId,
    toppingIds, toggleTopping, beverageIds, toggleBeverage,
    quantity, setQuantity, setStep,
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
      supabase.from("beverages").select("id,name,price").order("price"),
    ]).then(([bases, pizzas, toppings, beverages]) => {
      if (bases.error || pizzas.error || toppings.error || beverages.error) {
        setLoadState("error");
        return;
      }
      setMenu({
        bases: bases.data,
        pizzas: pizzas.data,
        toppings: toppings.data,
        beverages: beverages.data,
      });
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

  const selectedBase = useMemo(
    () => menu?.bases.find((b) => b.id === baseId) ?? null,
    [menu, baseId]
  );
  const selectedPizza = useMemo(
    () => menu?.pizzas.find((p) => p.id === pizzaId) ?? null,
    [menu, pizzaId]
  );
  const selectedToppings = useMemo(
    () => menu?.toppings.filter((t) => toppingIds.includes(t.id)) ?? [],
    [menu, toppingIds]
  );
  const selectedBeverages = useMemo(
    () => menu?.beverages.filter((b) => beverageIds.includes(b.id)) ?? [],
    [menu, beverageIds]
  );

  const bill = useMemo(() => {
    if (!selectedBase || !selectedPizza || qtyError) return null;
    return computeBill({
      basePrice: Number(selectedBase.price),
      pizzaPrice: Number(selectedPizza.price),
      toppingPrices: selectedToppings.map((t) => Number(t.price)),
      quantity,
      beveragePrices: selectedBeverages.map((b) => Number(b.price)),
    });
  }, [selectedBase, selectedPizza, selectedToppings, selectedBeverages, quantity, qtyError]);

  function applyMoodPick(type: MoodItemType, id: string) {
    if (type === "base") {
      setBaseId(id);
    } else if (type === "pizza") {
      setPizzaId(id);
    } else if (type === "topping") {
      if (!toppingIds.includes(id)) toggleTopping(id);
    } else if (!beverageIds.includes(id)) {
      toggleBeverage(id);
    }
  }

  // Contextual add-on suggestion, rendered inline next to the matching section.
  const upsell = useUpsell({
    base: selectedBase,
    pizza: selectedPizza,
    toppings: selectedToppings,
    beverages: selectedBeverages,
    quantity,
  });
  const recFor = (type: "base" | "pizza" | "topping" | "beverage") =>
    upsell.suggestion && upsell.suggestion.suggestedType === type ? (
      <RecommendationChip
        item={upsell.suggestion.suggestedItem}
        message={upsell.suggestion.message}
        onAdd={upsell.accept}
        onSkip={upsell.skip}
      />
    ) : null;

  if (loadState === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 p-16">
        <div className="h-16 w-16 animate-spin rounded-full border-2 border-white/10 border-t-[var(--accent)]" />
        <p className="text-zinc-400">Firing up the menu…</p>
      </div>
    );
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

  const buildLine = [
    selectedBase?.name,
    selectedPizza?.name,
    selectedToppings.length > 0 ? `${selectedToppings.length} topping${selectedToppings.length > 1 ? "s" : ""}` : null,
    selectedBeverages.length > 0 ? `${selectedBeverages.length} drink${selectedBeverages.length > 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      className="mx-auto w-full max-w-md pb-80"
    >
      {/* pizza stage — stays pinned while the customer scrolls the menu.
          Opaque + blurred so scrolling menu items never bleed through onto the pizza. */}
      <div className="sticky top-0 z-20 bg-[var(--background)]/95 px-6 pb-4 pt-3 shadow-[0_14px_26px_-16px_rgba(0,0,0,0.95)] backdrop-blur-md">
        <p className="mb-1 text-center text-xs font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">
          Pizza forge
        </p>
        <h2 className="mb-2 text-center text-xl font-bold">
          Build it live, {customerName.split(" ")[0]}
        </h2>
        <PizzaCanvas
          base={selectedBase}
          pizza={selectedPizza}
          toppings={selectedToppings}
          beverages={selectedBeverages}
          quantity={quantity}
        />
        <AnimatePresence mode="wait">
          <motion.p
            key={buildLine || "empty"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-1 h-5 text-center text-xs text-zinc-400"
          >
            {buildLine || "Nothing on the pan yet"}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="space-y-8 px-6 pt-4">
        <section>
          <SectionHeading n={1} label="Forge the dough" done={!!selectedBase} recommendation={recFor("base")} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {menu.bases.map((item) => (
              <SelectableCard key={item.id} item={item} selected={baseId === item.id} onSelect={() => setBaseId(item.id)} />
            ))}
          </div>
        </section>

        <section>
          <SectionHeading n={2} label="Pour the flavour" done={!!selectedPizza} recommendation={recFor("pizza")} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {menu.pizzas.map((item) => (
              <SelectableCard key={item.id} item={item} selected={pizzaId === item.id} onSelect={() => setPizzaId(item.id)} />
            ))}
          </div>
        </section>

        <section>
          <SectionHeading
            n={3}
            label="Rain the toppings"
            done={selectedToppings.length > 0}
            hint={selectedToppings.length > 0 ? `${selectedToppings.length} on board` : "optional"}
            recommendation={recFor("topping")}
          />
          <div className="grid grid-cols-2 gap-2">
            {menu.toppings.map((item) => (
              <SelectableCard key={item.id} item={item} selected={toppingIds.includes(item.id)} onSelect={() => toggleTopping(item.id)} />
            ))}
          </div>
        </section>

        <section>
          <SectionHeading
            n={4}
            label="Grab a drink"
            done={selectedBeverages.length > 0}
            hint={selectedBeverages.length > 0 ? `${selectedBeverages.length} chilling` : "optional"}
            recommendation={recFor("beverage")}
          />
          <div className="grid grid-cols-2 gap-2">
            {menu.beverages.map((item) => (
              <SelectableCard key={item.id} item={item} selected={beverageIds.includes(item.id)} onSelect={() => toggleBeverage(item.id)} />
            ))}
          </div>
        </section>

        <section>
          <SectionHeading n={5} label="How many pizzas?" done={!qtyError} />
          <div className="flex items-center gap-3">
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => handleQtyChange(String(Math.max(1, quantity - 1)))}
              className="h-12 w-12 rounded-xl border border-white/10 bg-white/5 text-xl transition hover:border-[var(--accent)]/60"
              aria-label="Decrease quantity"
            >
              −
            </motion.button>
            <input
              value={qtyInput}
              onChange={(e) => handleQtyChange(e.target.value)}
              inputMode="numeric"
              aria-label="Quantity"
              className="h-12 w-20 rounded-xl border border-white/10 bg-white/5 text-center text-lg outline-none transition focus:border-[var(--accent)] focus:shadow-[0_0_16px_-4px_var(--accent)]"
            />
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => handleQtyChange(String(Math.min(10, quantity + 1)))}
              className="h-12 w-12 rounded-xl border border-white/10 bg-white/5 text-xl transition hover:border-[var(--accent)]/60"
              aria-label="Increase quantity"
            >
              +
            </motion.button>
          </div>
          {qtyError && <p className="mt-2 text-sm text-red-400">{qtyError}</p>}
          <p className="mt-2 text-xs text-zinc-500">Order 5 or more and get 10% off automatically.</p>
        </section>
      </div>

      <MoodRecommender
        onPick={applyMoodPick}
        selectedIds={{
          base: baseId ? [baseId] : [],
          pizza: pizzaId ? [pizzaId] : [],
          topping: toppingIds,
          beverage: beverageIds,
        }}
      />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/70 p-4 backdrop-blur-xl">
        <div className="mx-auto max-w-md">
          {bill ? (
            <>
              <BillLines bill={bill} quantity={quantity} />
              <motion.button
                onClick={() => setStep("payment")}
                whileTap={{ scale: 0.97 }}
                className="glow-button mt-3 w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-black"
              >
                Continue to payment · {formatINR(bill.total)}
              </motion.button>
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
