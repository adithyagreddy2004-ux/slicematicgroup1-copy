import { NextResponse } from "next/server";

/**
 * AI SEAM — Smart Upselling Assistant (not built in this phase).
 *
 * Intended contract:
 *   POST { baseId, pizzaId, toppingIds, quantity }
 *   -> 200 { suggestion: { itemType: "topping", itemId: string, reason: string } }
 *
 * Intended implementation: combine a hand-authored pairing table with an
 * OpenRouter LLM call that phrases one contextual suggestion. On LLM
 * failure/timeout, fall back to the pairing table alone or skip silently.
 */
export async function POST() {
  return NextResponse.json({ error: "Not implemented yet." }, { status: 501 });
}
