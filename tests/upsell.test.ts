import { describe, expect, it } from "vitest";
import type { Menu } from "@/lib/types";
import {
  buildCanonicalUpsellDraft,
  deterministicRuleDrafts,
  selectUpsellCandidate,
  validateGeneratedRules,
  type UpsellRule,
} from "@/lib/upsell";

const menu: Menu = {
  bases: [
    { id: "B1", name: "Thin Crust", price: 149 },
    { id: "B5", name: "Cheese Burst", price: 229 },
  ],
  pizzas: [
    { id: "P1", name: "Margherita", price: 299 },
    { id: "P4", name: "Paneer Tikka", price: 339 },
  ],
  toppings: [
    { id: "T8", name: "Peri-Peri Drizzle", price: 59 },
    { id: "T9", name: "Extra Cheese", price: 69 },
  ],
  beverages: [
    { id: "D1", name: "Cola", price: 59 },
    { id: "D2", name: "Masala Chaas", price: 69 },
  ],
};

const rules: UpsellRule[] = [
  {
    id: "r1",
    trigger_type: "pizza",
    trigger_id: "P1",
    suggest_type: "topping",
    suggest_id: "T9",
    priority: 10,
    min_quantity: 1,
    max_quantity: null,
    reason_template: "Extra Cheese makes Margherita richer.",
  },
  {
    id: "r2",
    trigger_type: "pizza",
    trigger_id: "P4",
    suggest_type: "beverage",
    suggest_id: "D2",
    priority: 20,
    min_quantity: 1,
    max_quantity: null,
    reason_template: "Masala Chaas balances Paneer Tikka spice.",
  },
];

describe("upsell rule selection", () => {
  it("selects the first matching rule and item from the current menu", () => {
    const draft = buildCanonicalUpsellDraft({
      base: { id: "B1" },
      pizza: { id: "P1" },
      toppings: [],
      beverages: [],
      quantity: 2,
    }, menu);
    if (!draft.ok) throw new Error(draft.error);

    const candidate = selectUpsellCandidate(draft.order, rules, menu);
    expect(candidate?.suggestType).toBe("topping");
    expect(candidate?.item.id).toBe("T9");
  });

  it("does not suggest an item already selected by the customer", () => {
    const draft = buildCanonicalUpsellDraft({
      base: { id: "B1" },
      pizza: { id: "P1" },
      toppings: [{ id: "T9" }],
      beverages: [],
      quantity: 2,
    }, menu);
    if (!draft.ok) throw new Error(draft.error);

    expect(selectUpsellCandidate(draft.order, rules, menu)).toBeNull();
  });

  it("supports beverages when beverages exist in the menu", () => {
    const draft = buildCanonicalUpsellDraft({
      base: { id: "B1" },
      pizza: { id: "P4" },
      toppings: [],
      beverages: [],
      quantity: 1,
    }, menu);
    if (!draft.ok) throw new Error(draft.error);

    const candidate = selectUpsellCandidate(draft.order, rules, menu);
    expect(candidate?.suggestType).toBe("beverage");
    expect(candidate?.item.name).toBe("Masala Chaas");
  });
});

describe("AI-generated rule validation", () => {
  it("keeps only generated rules that reference current menu ids", () => {
    const valid = validateGeneratedRules({
      rules: [
        {
          trigger_type: "pizza",
          trigger_id: "P1",
          suggest_type: "topping",
          suggest_id: "T9",
          priority: 1,
          reason: "Classic cheese pairing for Margherita.",
          confidence: "high",
        },
        {
          trigger_type: "pizza",
          trigger_id: "P999",
          suggest_type: "topping",
          suggest_id: "T9",
          priority: 2,
          reason: "Invalid pizza id.",
          confidence: "high",
        },
      ],
    }, menu);

    expect(valid).toHaveLength(1);
    expect(valid[0].trigger_id).toBe("P1");
  });

  it("builds cold-start rules from available menu items", () => {
    const generated = deterministicRuleDrafts(menu);
    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((rule) => rule.trigger_id && rule.suggest_id)).toBe(true);
  });
});
