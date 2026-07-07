import { describe, expect, it } from "vitest";
import type { Menu } from "@/lib/types";
import {
  deterministicMoodRecommendations,
  parseMoodJson,
  validateMoodRecommendations,
} from "@/lib/mood";

const menu: Menu = {
  bases: [
    { id: "B1", name: "Thin Crust", price: 149 },
    { id: "B5", name: "Cheese Burst", price: 229 },
  ],
  pizzas: [
    { id: "P1", name: "Margherita", price: 299 },
    { id: "P4", name: "Paneer Tikka", price: 339 },
    { id: "P7", name: "BBQ Chicken", price: 369 },
  ],
  toppings: [
    { id: "T5", name: "Jalapenos", price: 49 },
    { id: "T8", name: "Peri-Peri Drizzle", price: 59 },
    { id: "T9", name: "Extra Cheese", price: 69 },
  ],
  beverages: [
    { id: "D1", name: "Cola", price: 59 },
    { id: "D3", name: "Fresh Lime Soda", price: 79 },
  ],
};

describe("mood recommendations", () => {
  it("builds deterministic spicy recommendations from real menu items", () => {
    const suggestions = deterministicMoodRecommendations("I want something spicy and bold", menu);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.item.id === "P4" || s.item.id === "P7")).toBe(true);
    expect(suggestions.every((s) => s.reason.length > 0)).toBe(true);
  });

  it("maps hunger to filling or cheesy recommendations", () => {
    const suggestions = deterministicMoodRecommendations("I am very hungry", menu);
    expect(suggestions.some((s) => s.item.id === "B5" || s.item.id === "T9")).toBe(true);
    expect(suggestions.some((s) => s.type === "pizza")).toBe(true);
  });

  it("maps sad moods to comfort recommendations", () => {
    const suggestions = deterministicMoodRecommendations("sad and tired", menu);
    expect(suggestions.some((s) => s.item.id === "B5" || s.item.id === "P1" || s.item.id === "T9")).toBe(true);
  });

  it("falls back to broadly appealing picks for vague moods", () => {
    const suggestions = deterministicMoodRecommendations("idk surprise me", menu);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.type === "pizza")).toBe(true);
  });

  it("does not fail when some menu categories are empty", () => {
    const sparseMenu: Menu = {
      bases: [],
      pizzas: [{ id: "P1", name: "Margherita", price: 299 }],
      toppings: [],
      beverages: [],
    };
    const suggestions = deterministicMoodRecommendations("hungry and excited", sparseMenu);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].item.id).toBe("P1");
  });

  it("keeps only AI suggestions that reference current menu ids", () => {
    const suggestions = validateMoodRecommendations({
      suggestions: [
        { type: "pizza", id: "P1", reason: "Classic and easy-going." },
        { type: "pizza", id: "P999", reason: "Invented pizza." },
        { type: "dessert", id: "X1", reason: "Invalid type." },
      ],
    }, menu);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].item.id).toBe("P1");
  });

  it("parses fenced JSON model responses", () => {
    const parsed = parseMoodJson('```json\n{ "suggestions": [{ "type": "pizza", "id": "P1", "reason": "Classic comfort." }] }\n```');
    const suggestions = validateMoodRecommendations(parsed, menu);
    expect(suggestions[0].item.name).toBe("Margherita");
  });
});
