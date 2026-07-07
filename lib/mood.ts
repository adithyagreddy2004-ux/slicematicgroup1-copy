import type { Menu, MenuItem } from "@/lib/types";

export type MoodItemType = "base" | "pizza" | "topping" | "beverage";

export interface MoodRecommendation {
  type: MoodItemType;
  item: MenuItem;
  reason: string;
}

export interface MoodRecommendationDraft {
  type: MoodItemType;
  id: string;
  reason: string;
}

export const MOOD_SYSTEM_PROMPT = `You are SliceMatic's mood-based menu recommender.
Your job is to recommend 2 to 4 menu items for a pizza customer based on their mood.

Strict rules:
1. Use ONLY item IDs from the provided menu.
2. Do NOT invent menu items, discounts, combos, availability, or prices.
3. Recommend only from categories present in the provided menu. If dessert is absent, do not mention dessert.
4. Prefer one pizza plus sensible add-ons such as a base, topping, or beverage.
5. Follow common food-mood conventions:
- sad, tired, stressed, or low -> warm, cheesy, comforting, slightly sweet where available
- excited, bold, adventurous, or energetic -> spicy, punchy, high-flavour picks
- hungry, starving, or very hungry -> filling, heavy, cheesy, or premium picks
- calm, fresh, light, or chill -> lighter bases, vegetable-forward pizzas, refreshing drinks
- happy, celebrating, date, party, or special -> premium-feeling, indulgent picks
6. Keep each reason under 18 words.
7. If the mood is vague, playful, empty, or off-topic, choose broadly appealing comfort picks.
8. Return ONLY valid JSON in this exact format:
{ "suggestions": [{ "type": "base" | "pizza" | "topping" | "beverage", "id": "valid_menu_id", "reason": "short reason" }] }`;

export function getMoodItemsByType(menu: Menu, type: MoodItemType): MenuItem[] {
  if (type === "base") return menu.bases;
  if (type === "pizza") return menu.pizzas;
  if (type === "topping") return menu.toppings;
  return menu.beverages;
}

export function getMoodItem(menu: Menu, type: MoodItemType, id: string): MenuItem | null {
  return getMoodItemsByType(menu, type).find((item) => item.id === id) ?? null;
}

function normalizeMood(mood: string): string {
  return mood.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim();
}

function firstMatching(items: MenuItem[], words: string[]): MenuItem | null {
  return items.find((item) => {
    const name = item.name.toLowerCase();
    return words.some((word) => name.includes(word));
  }) ?? null;
}

function maybePush(
  picks: MoodRecommendationDraft[],
  type: MoodItemType,
  item: MenuItem | null,
  reason: string
) {
  if (!item) return;
  picks.push({ type, id: item.id, reason });
}

function topPriced(items: MenuItem[]): MenuItem | null {
  return [...items].sort((a, b) => Number(b.price) - Number(a.price))[0] ?? null;
}

function cheapest(items: MenuItem[]): MenuItem | null {
  return [...items].sort((a, b) => Number(a.price) - Number(b.price))[0] ?? null;
}

export function deterministicMoodRecommendations(mood: string, menu: Menu): MoodRecommendation[] {
  const normalized = normalizeMood(mood);
  const picks: MoodRecommendationDraft[] = [];

  const spicy = /\b(spicy|hot|fire|bold|angry|adventurous|excited|energetic|kick)\b/.test(normalized);
  const hungry = /\b(hungry|starving|famished|heavy|filling|loaded|big)\b/.test(normalized);
  const comfort = /\b(comfy|comfort|sad|tired|cozy|warm|lazy|stressed|rough|low|down)\b/.test(normalized);
  const fresh = /\b(fresh|light|healthy|calm|chill|simple|clean|easy)\b/.test(normalized);
  const premium = /\b(celebrate|party|rich|premium|treat|fancy|happy|date|special)\b/.test(normalized);

  if (spicy) {
    const pizza = firstMatching(menu.pizzas, ["paneer", "bbq", "pepperoni"]) ?? topPriced(menu.pizzas);
    const topping = firstMatching(menu.toppings, ["peri", "jalapeno", "garlic"]);
    const drink = firstMatching(menu.beverages, ["cola", "lime", "chaas"]);
    maybePush(picks, "pizza", pizza, "A bold pick when you want stronger flavour.");
    maybePush(picks, "topping", topping, "Adds the extra kick your mood is asking for.");
    maybePush(picks, "beverage", drink, "Balances the heat and keeps the meal lively.");
  } else if (hungry) {
    const base = firstMatching(menu.bases, ["cheese", "thick", "multigrain"]) ?? topPriced(menu.bases);
    const pizza = firstMatching(menu.pizzas, ["deep", "bbq", "pepperoni", "paneer"]) ?? topPriced(menu.pizzas);
    const topping = firstMatching(menu.toppings, ["cheese", "mushroom", "garlic"]) ?? topPriced(menu.toppings);
    const drink = firstMatching(menu.beverages, ["coffee", "cola"]);
    maybePush(picks, "base", base, "A heavier base helps turn hunger into a proper meal.");
    maybePush(picks, "pizza", pizza, "A filling choice when you want something substantial.");
    maybePush(picks, "topping", topping, "Adds more bite and makes the pizza feel loaded.");
    maybePush(picks, "beverage", drink, "Rounds out a bigger meal without overthinking it.");
  } else if (comfort) {
    const base = firstMatching(menu.bases, ["cheese", "thick"]) ?? topPriced(menu.bases);
    const pizza = firstMatching(menu.pizzas, ["margherita", "deep", "farm"]) ?? cheapest(menu.pizzas);
    const topping = firstMatching(menu.toppings, ["cheese", "mushroom"]);
    const drink = firstMatching(menu.beverages, ["coffee", "orange", "tea"]);
    maybePush(picks, "base", base, "Makes the pizza feel warmer and more filling.");
    maybePush(picks, "pizza", pizza, "A comforting choice for an easy meal.");
    maybePush(picks, "topping", topping, "Adds a cozy finish without overcomplicating it.");
    maybePush(picks, "beverage", drink, "A softer drink pairing when you want comfort.");
  } else if (fresh) {
    const base = firstMatching(menu.bases, ["thin", "wheat", "multigrain"]) ?? cheapest(menu.bases);
    const pizza = firstMatching(menu.pizzas, ["veggie", "farm", "greek"]) ?? cheapest(menu.pizzas);
    const drink = firstMatching(menu.beverages, ["lime", "tea", "chaas"]);
    maybePush(picks, "base", base, "Keeps the order lighter and crisp.");
    maybePush(picks, "pizza", pizza, "Vegetable-forward flavours fit a fresh mood.");
    maybePush(picks, "beverage", drink, "A clean sip to keep things refreshing.");
  } else if (premium) {
    const base = firstMatching(menu.bases, ["cheese", "multigrain"]) ?? topPriced(menu.bases);
    const pizza = firstMatching(menu.pizzas, ["deep", "bbq", "pepperoni"]) ?? topPriced(menu.pizzas);
    const drink = firstMatching(menu.beverages, ["coffee", "orange", "iced"]);
    maybePush(picks, "base", base, "Adds a more indulgent feel to the order.");
    maybePush(picks, "pizza", pizza, "A bigger-flavour choice for a treat-yourself mood.");
    maybePush(picks, "beverage", drink, "Rounds out the meal with something special.");
  }

  if (picks.length === 0) {
    const pizza = firstMatching(menu.pizzas, ["margherita"]) ?? cheapest(menu.pizzas);
    const topping = firstMatching(menu.toppings, ["cheese"]) ?? cheapest(menu.toppings);
    const drink = firstMatching(menu.beverages, ["cola", "lime"]) ?? cheapest(menu.beverages);
    maybePush(picks, "pizza", pizza, "A safe crowd-pleaser when you are unsure.");
    maybePush(picks, "topping", topping, "A simple add-on that makes most pizzas better.");
    maybePush(picks, "beverage", drink, "Easy pairing for almost any pizza mood.");
  }

  return validateMoodRecommendations(picks, menu);
}

function isMoodType(value: unknown): value is MoodItemType {
  return value === "base" || value === "pizza" || value === "topping" || value === "beverage";
}

export function parseMoodJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(trimmed);
}

export function validateMoodRecommendations(raw: unknown, menu: Menu): MoodRecommendation[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { suggestions?: unknown }).suggestions)
      ? (raw as { suggestions: unknown[] }).suggestions
      : [];

  const seen = new Set<string>();
  const out: MoodRecommendation[] = [];
  for (const row of rows.slice(0, 8)) {
    if (!row || typeof row !== "object") continue;
    const suggestion = row as Record<string, unknown>;
    const type = suggestion.type;
    const id = suggestion.id;
    const reason = suggestion.reason;

    if (!isMoodType(type) || typeof id !== "string") continue;
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    const item = getMoodItem(menu, type, id);
    if (!item) continue;

    seen.add(key);
    out.push({
      type,
      item,
      reason: typeof reason === "string" && reason.trim().length >= 6
        ? reason.trim().slice(0, 140)
        : "This fits the mood you described.",
    });
    if (out.length >= 4) break;
  }

  return out;
}
