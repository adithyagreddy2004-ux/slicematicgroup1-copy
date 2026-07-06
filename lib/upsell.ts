import type { Menu, MenuItem } from "@/lib/types";

export type MenuItemType = "base" | "pizza" | "topping" | "beverage";
export type UpsellTriggerType = MenuItemType | "any";
export type UpsellConfidence = "high" | "medium" | "low";

export interface UpsellRule {
  id: string;
  trigger_type: UpsellTriggerType;
  trigger_id: string | null;
  suggest_type: MenuItemType;
  suggest_id: string;
  priority: number;
  min_quantity: number;
  max_quantity: number | null;
  reason_template: string;
}

export interface UpsellOrderDraft {
  base: MenuItem;
  pizza: MenuItem;
  toppings: MenuItem[];
  beverages: MenuItem[];
  quantity: number;
}

export interface UpsellCandidate {
  rule: UpsellRule;
  suggestType: MenuItemType;
  item: MenuItem;
}

export interface GeneratedUpsellRule {
  trigger_type: MenuItemType;
  trigger_id: string;
  suggest_type: MenuItemType;
  suggest_id: string;
  priority: number;
  reason_template: string;
  confidence: UpsellConfidence;
}

export const CUSTOMER_UPSELL_SYSTEM_PROMPT = `You are the Smart Upselling Assistant for SliceMatic, a single-outlet pizza brand.
Your job is to write one short, polite upsell suggestion for the customer's current pizza order.

Strict rules:
1. Suggest ONLY the candidate item provided by the backend.
2. Do NOT invent menu items, prices, discounts, combos, coupons, delivery promises, or availability.
3. Do NOT suggest an item already present in the customer's order.
4. Keep the message under 25 words.
5. Sound natural, helpful, and non-pushy.
6. Mention why the suggested item fits the current pizza.
7. Do not use emojis.
8. Do not mention AI, model, prompt, backend, database, or rules.
9. Return ONLY valid JSON in this exact format:
{ "message": "short upsell sentence", "confidence": "high" | "medium" | "low" }

If the candidate item is not relevant, return:
{ "message": "", "confidence": "low" }`;

export const RULE_GENERATOR_SYSTEM_PROMPT = `You are the Smart Upselling Rule Generator for SliceMatic pizza ordering system.
Your job is to generate upsell rules from the provided menu, existing upsell rules, order patterns, and upsell performance stats.

Rules:
1. Return ONLY valid JSON.
2. Use ONLY item IDs provided in the menu.
3. Do NOT invent menu items.
4. Do NOT suggest the same item as the trigger item.
5. Suggested items may be bases, pizzas, toppings, or beverages only when that type exists in the provided menu.
6. If beverages exist in the menu, beverages may be suggested. If beverages are absent, do not suggest beverages.
7. Prefer toppings, beverages, and sensible base upgrades over replacing the selected pizza.
8. Do NOT suggest an item that is already commonly rejected in the performance data.
9. If there is no order or event history, use food-pairing logic based on item names.
10. Generate at most 10 rules.
11. Each rule must have a clear business reason explainable to a restaurant owner.

Return JSON in this format:
{
  "mode": "cold_start" | "data_driven",
  "rules": [
    {
      "trigger_type": "base" | "pizza" | "topping" | "beverage",
      "trigger_id": "valid_item_id",
      "suggest_type": "base" | "pizza" | "topping" | "beverage",
      "suggest_id": "valid_item_id",
      "priority": 1,
      "reason": "short reason",
      "confidence": "high" | "medium" | "low"
    }
  ]
}`;

export function getItemsByType(menu: Menu, type: MenuItemType): MenuItem[] {
  if (type === "base") return menu.bases;
  if (type === "pizza") return menu.pizzas;
  if (type === "topping") return menu.toppings;
  return menu.beverages;
}

export function getItemByType(menu: Menu, type: MenuItemType, id: string): MenuItem | null {
  return getItemsByType(menu, type).find((item) => item.id === id) ?? null;
}

function isMenuItem(value: unknown): value is MenuItem {
  if (!value || typeof value !== "object") return false;
  const item = value as MenuItem;
  return typeof item.id === "string" && item.id.length > 0;
}

function itemId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (isMenuItem(value)) return value.id;
  return null;
}

export function buildCanonicalUpsellDraft(raw: unknown, menu: Menu): { ok: true; order: UpsellOrderDraft } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Invalid order draft." };
  }

  const draft = raw as {
    base?: unknown;
    pizza?: unknown;
    toppings?: unknown;
    beverages?: unknown;
    quantity?: unknown;
  };

  const quantity = typeof draft.quantity === "number" ? draft.quantity : Number(draft.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return { ok: false, error: "Quantity must be between 1 and 10." };
  }

  const baseId = itemId(draft.base);
  const pizzaId = itemId(draft.pizza);
  if (!baseId || !pizzaId) return { ok: false, error: "Base and pizza are required." };

  const base = getItemByType(menu, "base", baseId);
  const pizza = getItemByType(menu, "pizza", pizzaId);
  if (!base || !pizza) return { ok: false, error: "Selected base or pizza is not on the menu." };

  const rawToppings = Array.isArray(draft.toppings) ? draft.toppings : [];
  const rawBeverages = Array.isArray(draft.beverages) ? draft.beverages : [];
  const toppingIds = rawToppings.map(itemId);
  const beverageIds = rawBeverages.map(itemId);
  if (toppingIds.some((id) => !id) || beverageIds.some((id) => !id)) {
    return { ok: false, error: "Selected add-ons are invalid." };
  }

  const uniqueToppingIds = new Set(toppingIds as string[]);
  const uniqueBeverageIds = new Set(beverageIds as string[]);
  if (uniqueToppingIds.size !== toppingIds.length || uniqueBeverageIds.size !== beverageIds.length) {
    return { ok: false, error: "Selected add-ons cannot be duplicated." };
  }

  const toppings = (toppingIds as string[]).map((id) => getItemByType(menu, "topping", id));
  const beverages = (beverageIds as string[]).map((id) => getItemByType(menu, "beverage", id));
  if (toppings.some((item) => !item) || beverages.some((item) => !item)) {
    return { ok: false, error: "A selected add-on is not on the menu." };
  }

  return {
    ok: true,
    order: {
      base,
      pizza,
      toppings: toppings as MenuItem[],
      beverages: beverages as MenuItem[],
      quantity,
    },
  };
}

export function cartSignature(order: UpsellOrderDraft): string {
  const toppingIds = order.toppings.map((item) => item.id).sort().join(",");
  const beverageIds = order.beverages.map((item) => item.id).sort().join(",");
  return `${order.base.id}|${order.pizza.id}|t:${toppingIds}|b:${beverageIds}|qty:${order.quantity}`;
}

export function isAlreadySelected(order: UpsellOrderDraft, type: MenuItemType, id: string): boolean {
  if (type === "base") return order.base.id === id;
  if (type === "pizza") return order.pizza.id === id;
  if (type === "topping") return order.toppings.some((item) => item.id === id);
  return order.beverages.some((item) => item.id === id);
}

export function ruleMatches(order: UpsellOrderDraft, rule: UpsellRule): boolean {
  if (order.quantity < rule.min_quantity) return false;
  if (rule.max_quantity !== null && order.quantity > rule.max_quantity) return false;
  if (rule.trigger_type === "any") return true;
  if (rule.trigger_type === "base") return rule.trigger_id === order.base.id;
  if (rule.trigger_type === "pizza") return rule.trigger_id === order.pizza.id;
  if (rule.trigger_type === "topping") {
    return order.toppings.some((item) => item.id === rule.trigger_id);
  }
  return order.beverages.some((item) => item.id === rule.trigger_id);
}

export function selectUpsellCandidate(order: UpsellOrderDraft, rules: UpsellRule[], menu: Menu): UpsellCandidate | null {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    if (!ruleMatches(order, rule)) continue;
    if (isAlreadySelected(order, rule.suggest_type, rule.suggest_id)) continue;

    const item = getItemByType(menu, rule.suggest_type, rule.suggest_id);
    if (!item) continue;

    return { rule, suggestType: rule.suggest_type, item };
  }
  return null;
}

export function fallbackUpsellMessage(order: UpsellOrderDraft, candidate: UpsellCandidate): string {
  const itemName = candidate.item.name;
  if (candidate.suggestType === "base") {
    return `Upgrade to ${itemName} to make your ${order.pizza.name} feel more premium.`;
  }
  if (candidate.suggestType === "pizza") {
    return `${itemName} is a stronger pick if you want a richer pizza today.`;
  }
  if (candidate.suggestType === "beverage") {
    return `${itemName} pairs well with ${order.pizza.name} and completes the meal.`;
  }
  return `Add ${itemName} to make your ${order.pizza.name} more flavourful.`;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findByName(items: MenuItem[], includes: string[]): MenuItem | null {
  const wanted = includes.map((part) => part.toLowerCase());
  return items.find((item) => {
    const normalized = normalizeName(item.name);
    return wanted.every((part) => normalized.includes(part));
  }) ?? null;
}

function firstAvailable(items: Array<MenuItem | null>): MenuItem | null {
  return items.find((item): item is MenuItem => Boolean(item)) ?? null;
}

export function deterministicRuleDrafts(menu: Menu): GeneratedUpsellRule[] {
  const pairs: GeneratedUpsellRule[] = [];
  const toppingFallback = [...menu.toppings].sort((a, b) => Number(b.price) - Number(a.price))[0] ?? null;
  const beverageFallback = [...menu.beverages].sort((a, b) => Number(b.price) - Number(a.price))[0] ?? null;

  for (const pizza of menu.pizzas) {
    const name = normalizeName(pizza.name);
    const topping = firstAvailable([
      name.includes("margherita") ? findByName(menu.toppings, ["extra", "cheese"]) : null,
      name.includes("paneer") ? findByName(menu.toppings, ["peri"]) : null,
      name.includes("bbq") ? findByName(menu.toppings, ["garlic"]) : null,
      name.includes("farm") ? findByName(menu.toppings, ["mushroom"]) : null,
      name.includes("greek") || name.includes("mediterranean") ? findByName(menu.toppings, ["olive"]) : null,
      name.includes("california") ? findByName(menu.toppings, ["tomato"]) : null,
      name.includes("pepperoni") ? findByName(menu.toppings, ["jalapeno"]) : null,
      name.includes("deep") ? findByName(menu.toppings, ["extra", "cheese"]) : null,
      toppingFallback,
    ]);

    if (topping) {
      pairs.push({
        trigger_type: "pizza",
        trigger_id: pizza.id,
        suggest_type: "topping",
        suggest_id: topping.id,
        priority: (pairs.length + 1) * 10,
        reason_template: `${topping.name} is a relevant add-on for ${pizza.name}.`,
        confidence: "medium",
      });
    }

    if (pairs.length < 10 && menu.beverages.length > 0) {
      const beverage = firstAvailable([
        name.includes("paneer") ? findByName(menu.beverages, ["chaas"]) : null,
        name.includes("pepperoni") || name.includes("bbq") ? findByName(menu.beverages, ["cola"]) : null,
        beverageFallback,
      ]);
      if (beverage) {
        pairs.push({
          trigger_type: "pizza",
          trigger_id: pizza.id,
          suggest_type: "beverage",
          suggest_id: beverage.id,
          priority: (pairs.length + 1) * 10,
          reason_template: `${beverage.name} is a sensible drink pairing for ${pizza.name}.`,
          confidence: "medium",
        });
      }
    }

    if (pairs.length >= 10) break;
  }

  return dedupeGeneratedRules(pairs).slice(0, 10);
}

export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(trimmed);
}

function isMenuItemType(value: unknown): value is MenuItemType {
  return value === "base" || value === "pizza" || value === "topping" || value === "beverage";
}

function isConfidence(value: unknown): value is UpsellConfidence {
  return value === "high" || value === "medium" || value === "low";
}

function dedupeGeneratedRules(rules: GeneratedUpsellRule[]): GeneratedUpsellRule[] {
  const seen = new Set<string>();
  const out: GeneratedUpsellRule[] = [];
  for (const rule of rules) {
    const key = `${rule.trigger_type}:${rule.trigger_id}->${rule.suggest_type}:${rule.suggest_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rule);
  }
  return out;
}

export function validateGeneratedRules(raw: unknown, menu: Menu): GeneratedUpsellRule[] {
  const rules = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { rules?: unknown }).rules)
      ? (raw as { rules: unknown[] }).rules
      : [];

  const valid: GeneratedUpsellRule[] = [];
  for (const rawRule of rules.slice(0, 20)) {
    if (!rawRule || typeof rawRule !== "object") continue;
    const rule = rawRule as Record<string, unknown>;
    const triggerType = rule.trigger_type;
    const suggestType = rule.suggest_type;
    const triggerId = rule.trigger_id;
    const suggestId = rule.suggest_id;
    const confidence = rule.confidence;
    const reason = typeof rule.reason === "string" ? rule.reason : rule.reason_template;

    if (!isMenuItemType(triggerType) || !isMenuItemType(suggestType)) continue;
    if (typeof triggerId !== "string" || typeof suggestId !== "string") continue;
    if (triggerType === suggestType && triggerId === suggestId) continue;
    if (!getItemByType(menu, triggerType, triggerId)) continue;
    if (!getItemByType(menu, suggestType, suggestId)) continue;
    if (!isConfidence(confidence)) continue;
    if (typeof reason !== "string" || reason.trim().length < 8) continue;

    const priorityRaw = Number(rule.priority);
    const priority = Number.isInteger(priorityRaw) && priorityRaw > 0 ? priorityRaw : (valid.length + 1) * 10;
    valid.push({
      trigger_type: triggerType,
      trigger_id: triggerId,
      suggest_type: suggestType,
      suggest_id: suggestId,
      priority,
      reason_template: reason.trim().slice(0, 240),
      confidence,
    });
  }

  return dedupeGeneratedRules(valid).slice(0, 10);
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
