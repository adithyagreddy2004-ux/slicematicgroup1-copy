import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMenu } from "@/lib/upsell-server";
import {
  MOOD_SYSTEM_PROMPT,
  deterministicMoodRecommendations,
  parseMoodJson,
  validateMoodRecommendations,
} from "@/lib/mood";
import type { Menu } from "@/lib/types";

const OPENROUTER_MODEL = "openai/gpt-4o-mini";

function compactMenu(menu: Menu) {
  return {
    bases: menu.bases.map((item) => ({ id: item.id, name: item.name, price: Number(item.price) })),
    pizzas: menu.pizzas.map((item) => ({ id: item.id, name: item.name, price: Number(item.price) })),
    toppings: menu.toppings.map((item) => ({ id: item.id, name: item.name, price: Number(item.price) })),
    beverages: menu.beverages.map((item) => ({ id: item.id, name: item.name, price: Number(item.price) })),
  };
}

function userPrompt(mood: string, menu: Menu): string {
  return `Customer mood:
${mood}

Available menu:
${JSON.stringify(compactMenu(menu))}

Recommend a small set of menu items that match the mood.`;
}

async function callOpenRouter(mood: string, menu: Menu): Promise<unknown | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        "X-Title": "SliceMatic Mood Recommender",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: MOOD_SYSTEM_PROMPT },
          { role: "user", content: userPrompt(mood, menu) },
        ],
        temperature: 0.35,
        max_tokens: 320,
      }),
    });

    clearTimeout(timeout);
    if (!response.ok) return null;

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    return parseMoodJson(content);
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const mood = body && typeof body === "object"
      ? (body as { mood?: unknown }).mood
      : null;
    if (typeof mood !== "string" || mood.trim().length === 0) {
      return NextResponse.json({ error: "Tell us your mood first." }, { status: 400 });
    }
    if (mood.trim().length > 120) {
      return NextResponse.json({ error: "Keep the mood to 120 characters or fewer." }, { status: 400 });
    }

    const db = createAdminClient();
    const menuResult = await fetchMenu(db);
    if (!menuResult.ok) {
      return NextResponse.json({ error: menuResult.error }, { status: 503 });
    }

    const aiResponse = await callOpenRouter(mood.trim(), menuResult.menu);
    const aiSuggestions = validateMoodRecommendations(aiResponse, menuResult.menu);
    const suggestions = aiSuggestions.length > 0
      ? aiSuggestions
      : deterministicMoodRecommendations(mood.trim(), menuResult.menu);

    return NextResponse.json({
      suggestions,
      source: aiSuggestions.length > 0 ? "openrouter" : "fallback",
    });
  } catch {
    return NextResponse.json({ error: "Mood recommendations are unavailable right now." }, { status: 500 });
  }
}
