import { NextResponse } from "next/server";

/**
 * AI SEAM — Mood-Based Menu Recommender (not built in this phase).
 *
 * Intended contract:
 *   POST { mood: string }
 *   -> 200 { suggestions: [{ pizzaId: string, reason: string }] }  // 2-3 items
 *
 * Intended implementation: OpenRouter LLM constrained by a system prompt that
 * maps mood -> menu attributes and may only return ids present in the DB menu.
 * Empty/nonsense/off-topic input returns a default popular-combo suggestion.
 */
export async function POST() {
  return NextResponse.json({ error: "Not implemented yet." }, { status: 501 });
}
