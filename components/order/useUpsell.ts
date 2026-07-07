"use client";

import { useEffect, useMemo, useState } from "react";
import { useOrder } from "./OrderContext";
import type { MenuItem } from "@/lib/types";
import type { MenuItemType, UpsellOrderDraft } from "@/lib/upsell";

export interface UpsellSuggestion {
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
    order.toppings.map((i) => i.id).sort().join(","),
    order.beverages.map((i) => i.id).sort().join(","),
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
    // Upsell tracking must never block the order.
  }
}

interface Args {
  base: MenuItem | null;
  pizza: MenuItem | null;
  toppings: MenuItem[];
  beverages: MenuItem[];
  quantity: number;
}

/**
 * Fetches a single contextual add-on suggestion for the current cart and
 * exposes accept / skip handlers. Re-fetches automatically whenever the cart
 * changes, so accepting one suggestion surfaces the next.
 */
export function useUpsell({ base, pizza, toppings, beverages, quantity }: Args) {
  const {
    setBaseId, setPizzaId,
    toppingIds, toggleTopping,
    beverageIds, toggleBeverage,
    setAcceptedUpsellEventId,
  } = useOrder();

  const [suggestion, setSuggestion] = useState<UpsellSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const orderDraft = useMemo<UpsellOrderDraft | null>(() => {
    if (!base || !pizza) return null;
    return { base, pizza, toppings, beverages, quantity };
  }, [base, pizza, toppings, beverages, quantity]);
  const cartKey = useMemo(() => signature(orderDraft), [orderDraft]);

  useEffect(() => {
    let active = true;
    if (!orderDraft || dismissed.includes(cartKey)) {
      Promise.resolve().then(() => {
        if (!active) return;
        setSuggestion(null);
        setLoading(false);
      });
      return () => { active = false; };
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
        setSuggestion(response.ok && data.hasSuggestion ? (data as UpsellSuggestion) : null);
      } catch {
        if (active) setSuggestion(null);
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => { active = false; };
  }, [cartKey, dismissed, orderDraft]);

  function rememberDismissed() {
    setDismissed((cur) => (cur.includes(cartKey) ? cur : [...cur, cartKey]));
  }

  function accept() {
    if (!suggestion || !orderDraft) return;
    const { suggestedType, suggestedItem, eventId } = suggestion;
    if (suggestedType === "base") {
      setBaseId(suggestedItem.id);
    } else if (suggestedType === "pizza") {
      setPizzaId(suggestedItem.id);
    } else if (suggestedType === "topping") {
      if (!toppingIds.includes(suggestedItem.id)) toggleTopping(suggestedItem.id);
    } else if (!beverageIds.includes(suggestedItem.id)) {
      toggleBeverage(suggestedItem.id);
    }
    setAcceptedUpsellEventId(eventId);
    void markUpsellEvent(eventId, true, orderDraft);
    setSuggestion(null);
    // cart change re-triggers the effect → next suggestion appears.
  }

  function skip() {
    if (suggestion) void markUpsellEvent(suggestion.eventId, false, orderDraft);
    rememberDismissed();
    setSuggestion(null);
  }

  return { suggestion, loading, accept, skip };
}
