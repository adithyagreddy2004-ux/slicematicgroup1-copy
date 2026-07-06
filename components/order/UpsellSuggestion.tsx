"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { formatINR } from "@/lib/pricing";
import type { MenuItem } from "@/lib/types";
import type { MenuItemType, UpsellOrderDraft } from "@/lib/upsell";
import { useOrder } from "./OrderContext";

interface UpsellResponse {
  hasSuggestion: boolean;
  suggestedType: MenuItemType;
  suggestedItem: MenuItem;
  message: string;
  eventId: string | null;
}

function signature(order: UpsellOrderDraft | null): string {
  if (!order) return "";
  return [
    order.base.id,
    order.pizza.id,
    order.toppings.map((item) => item.id).sort().join(","),
    order.beverages.map((item) => item.id).sort().join(","),
    order.quantity,
  ].join("|");
}

async function markUpsellEvent(eventId: string | null, accepted: boolean, orderDraft: UpsellOrderDraft | null) {
  if (!eventId) return;
  try {
    await fetch("/api/ai/upsell/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, accepted, orderDraft }),
    });
  } catch {
    // Upsell tracking must never block checkout.
  }
}

export default function UpsellSuggestion({
  base,
  pizza,
  toppings,
  beverages,
  quantity,
}: {
  base: MenuItem | null;
  pizza: MenuItem | null;
  toppings: MenuItem[];
  beverages: MenuItem[];
  quantity: number;
}) {
  const {
    setBaseId,
    setPizzaId,
    toppingIds,
    toggleTopping,
    beverageIds,
    toggleBeverage,
    setAcceptedUpsellEventId,
  } = useOrder();
  const [suggestion, setSuggestion] = useState<UpsellResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [acceptedOnce, setAcceptedOnce] = useState(false);

  const orderDraft = useMemo<UpsellOrderDraft | null>(() => {
    if (!base || !pizza) return null;
    return { base, pizza, toppings, beverages, quantity };
  }, [base, pizza, toppings, beverages, quantity]);
  const cartKey = useMemo(() => signature(orderDraft), [orderDraft]);

  useEffect(() => {
    let active = true;
    if (acceptedOnce || !orderDraft || dismissed.includes(cartKey)) {
      Promise.resolve().then(() => {
        if (!active) return;
        setSuggestion(null);
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }

    Promise.resolve().then(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/ai/upsell", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderDraft }),
        });
        const data = await response.json();
        if (!active) return;
        if (response.ok && data.hasSuggestion) {
          setSuggestion(data as UpsellResponse);
        } else {
          setSuggestion(null);
        }
      } catch {
        if (active) setSuggestion(null);
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [acceptedOnce, cartKey, dismissed, orderDraft]);

  function rememberDismissed() {
    setDismissed((current) => current.includes(cartKey) ? current : [...current, cartKey]);
  }

  function acceptSuggestion() {
    if (!suggestion || !orderDraft) return;
    if (suggestion.suggestedType === "base") {
      setBaseId(suggestion.suggestedItem.id);
    } else if (suggestion.suggestedType === "pizza") {
      setPizzaId(suggestion.suggestedItem.id);
    } else if (suggestion.suggestedType === "topping") {
      if (!toppingIds.includes(suggestion.suggestedItem.id)) {
        toggleTopping(suggestion.suggestedItem.id);
      }
    } else if (!beverageIds.includes(suggestion.suggestedItem.id)) {
      toggleBeverage(suggestion.suggestedItem.id);
    }

    setAcceptedUpsellEventId(suggestion.eventId);
    void markUpsellEvent(suggestion.eventId, true, orderDraft);
    setAcceptedOnce(true);
    rememberDismissed();
    setSuggestion(null);
  }

  function skipSuggestion() {
    if (suggestion) {
      void markUpsellEvent(suggestion.eventId, false, orderDraft);
    }
    rememberDismissed();
    setSuggestion(null);
  }

  if (!orderDraft) return null;

  if (loading && !suggestion) {
    return (
      <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400">
        Checking a relevant add-on...
      </div>
    );
  }

  if (!suggestion) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
            Recommended add-on
          </p>
          <p className="mt-1 text-sm text-zinc-100">{suggestion.message}</p>
          <p className="mt-1 text-xs text-zinc-400">
            {suggestion.suggestedItem.name} · {formatINR(Number(suggestion.suggestedItem.price))}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={acceptSuggestion}
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black"
        >
          Add to order
        </button>
        <button
          type="button"
          onClick={skipSuggestion}
          className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-zinc-300"
        >
          No thanks
        </button>
      </div>
    </motion.div>
  );
}
