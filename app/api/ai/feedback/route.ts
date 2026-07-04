import { NextResponse } from "next/server";

/**
 * AI SEAM — Review & Feedback Insight Miner (not built in this phase).
 *
 * Intended contract:
 *   POST { texts: string[] }
 *   -> 200 { themes: [{ label: string, count: number, examples: string[] }] }
 *
 * Intended implementation: batch reviews/feedback through an OpenRouter LLM
 * that clusters recurring complaints into actionable categories for admin.
 */
export async function POST() {
  return NextResponse.json({ error: "Not implemented yet." }, { status: 501 });
}
