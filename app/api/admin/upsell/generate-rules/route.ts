import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMenu, requireStaff } from "@/lib/upsell-server";
import {
  RULE_GENERATOR_SYSTEM_PROMPT,
  deterministicRuleDrafts,
  parseJsonObject,
  validateGeneratedRules,
  type GeneratedUpsellRule,
} from "@/lib/upsell";
import type { Menu } from "@/lib/types";

const OPENROUTER_MODEL = "openai/gpt-4o-mini";

interface CurrentRuleRow {
  id: string;
  trigger_type: string;
  trigger_id: string | null;
  suggest_type: string;
  suggest_id: string;
  priority: number;
  reason_template: string;
}

interface UpsellEventSummaryRow {
  rule_id: string | null;
  suggested_type: string;
  suggested_id: string;
  suggested_name: string;
  accepted: boolean | null;
  revenue_impact: number;
}

interface OrderItemSummaryRow {
  order_id: string;
  item_type: "base" | "pizza" | "topping" | "beverage";
  item_id: string;
  item_name: string;
  quantity: number;
}

interface InputSummary {
  menu_items: Record<string, Array<{ id: string; name: string; price: number }>>;
  current_rules: CurrentRuleRow[];
  upsell_performance_summary: {
    shown: number;
    accepted: number;
    skipped: number;
    acceptance_rate: number;
    extra_revenue: number;
    by_rule: Array<{
      rule_id: string | null;
      suggested_name: string;
      shown: number;
      accepted: number;
      acceptance_rate: number;
      extra_revenue: number;
    }>;
  };
  order_patterns_summary: {
    total_orders: number;
    top_pizzas: Array<{ item_id: string; item_name: string; count: number }>;
    top_toppings: Array<{ item_id: string; item_name: string; count: number }>;
    top_beverages: Array<{ item_id: string; item_name: string; count: number }>;
    common_pairs: Array<{ pizza_id: string; add_on_id: string; add_on_type: string; count: number }>;
    note?: string;
  };
}

function compactMenu(menu: Menu): InputSummary["menu_items"] {
  return {
    bases: menu.bases.map((item) => ({ id: item.id, name: item.name, price: Number(item.price) })),
    pizzas: menu.pizzas.map((item) => ({ id: item.id, name: item.name, price: Number(item.price) })),
    toppings: menu.toppings.map((item) => ({ id: item.id, name: item.name, price: Number(item.price) })),
    beverages: menu.beverages.map((item) => ({ id: item.id, name: item.name, price: Number(item.price) })),
  };
}

function roundRate(accepted: number, shown: number): number {
  if (shown === 0) return 0;
  return Math.round((accepted / shown) * 1000) / 10;
}

function buildPerformanceSummary(events: UpsellEventSummaryRow[]): InputSummary["upsell_performance_summary"] {
  const shown = events.length;
  const accepted = events.filter((event) => event.accepted === true).length;
  const skipped = events.filter((event) => event.accepted === false).length;
  const extraRevenue = events.reduce((sum, event) => sum + Number(event.revenue_impact ?? 0), 0);
  const groups = new Map<string, UpsellEventSummaryRow[]>();

  for (const event of events) {
    const key = `${event.rule_id ?? "none"}:${event.suggested_type}:${event.suggested_id}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  return {
    shown,
    accepted,
    skipped,
    acceptance_rate: roundRate(accepted, shown),
    extra_revenue: Math.round(extraRevenue * 100) / 100,
    by_rule: [...groups.values()]
      .map((rows) => {
        const acceptedRows = rows.filter((row) => row.accepted === true);
        const revenue = rows.reduce((sum, row) => sum + Number(row.revenue_impact ?? 0), 0);
        return {
          rule_id: rows[0]?.rule_id ?? null,
          suggested_name: rows[0]?.suggested_name ?? "Unknown",
          shown: rows.length,
          accepted: acceptedRows.length,
          acceptance_rate: roundRate(acceptedRows.length, rows.length),
          extra_revenue: Math.round(revenue * 100) / 100,
        };
      })
      .sort((a, b) => b.accepted - a.accepted)
      .slice(0, 10),
  };
}

function topItems(items: OrderItemSummaryRow[], type: OrderItemSummaryRow["item_type"]) {
  const counts = new Map<string, { item_id: string; item_name: string; count: number }>();
  for (const item of items.filter((row) => row.item_type === type)) {
    const existing = counts.get(item.item_id) ?? { item_id: item.item_id, item_name: item.item_name, count: 0 };
    existing.count += Number(item.quantity ?? 1);
    counts.set(item.item_id, existing);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
}

function buildOrderPatternSummary(items: OrderItemSummaryRow[]): InputSummary["order_patterns_summary"] {
  const orderIds = new Set(items.map((item) => item.order_id));
  const byOrder = new Map<string, OrderItemSummaryRow[]>();
  for (const item of items) {
    byOrder.set(item.order_id, [...(byOrder.get(item.order_id) ?? []), item]);
  }

  const pairCounts = new Map<string, { pizza_id: string; add_on_id: string; add_on_type: string; count: number }>();
  for (const rows of byOrder.values()) {
    const pizzas = rows.filter((row) => row.item_type === "pizza");
    const addOns = rows.filter((row) => row.item_type === "topping" || row.item_type === "beverage");
    for (const pizza of pizzas) {
      for (const addOn of addOns) {
        const key = `${pizza.item_id}:${addOn.item_type}:${addOn.item_id}`;
        const existing = pairCounts.get(key) ?? {
          pizza_id: pizza.item_id,
          add_on_id: addOn.item_id,
          add_on_type: addOn.item_type,
          count: 0,
        };
        existing.count += 1;
        pairCounts.set(key, existing);
      }
    }
  }

  const summary = {
    total_orders: orderIds.size,
    top_pizzas: topItems(items, "pizza"),
    top_toppings: topItems(items, "topping"),
    top_beverages: topItems(items, "beverage"),
    common_pairs: [...pairCounts.values()].sort((a, b) => b.count - a.count).slice(0, 10),
  };

  if (summary.total_orders === 0) {
    return {
      ...summary,
      note: "No historical orders yet. Use cold-start food-pairing logic from menu names and prices.",
    };
  }

  return summary;
}

function buildPrompt(input: InputSummary): string {
  return `Menu items:
${JSON.stringify(input.menu_items)}

Current active upsell rules:
${JSON.stringify(input.current_rules)}

Upsell performance summary:
${JSON.stringify(input.upsell_performance_summary)}

Order pattern summary:
${JSON.stringify(input.order_patterns_summary)}

Generate a fresh set of upsell rules for the current menu.`;
}

function choiceContent(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const choices = (result as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (!first || typeof first !== "object") return null;
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

async function callOpenRouter(input: InputSummary): Promise<{ parsed: unknown | null; raw: unknown | null; error: string | null }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { parsed: null, raw: null, error: "OPENROUTER_API_KEY is not configured." };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        "X-Title": "SliceMatic Upsell Rule Generator",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: RULE_GENERATOR_SYSTEM_PROMPT },
          { role: "user", content: buildPrompt(input) },
        ],
        temperature: 0.2,
        max_tokens: 1200,
      }),
    });

    const raw: unknown = await response.json();
    if (!response.ok) {
      return { parsed: null, raw, error: "OpenRouter returned an error." };
    }

    const content = choiceContent(raw);
    if (!content) return { parsed: null, raw, error: "OpenRouter response did not include content." };
    return { parsed: parseJsonObject(content), raw, error: null };
  } catch {
    return { parsed: null, raw: null, error: "OpenRouter request failed." };
  }
}

function modeFromInput(input: InputSummary): "cold_start" | "data_driven" {
  return input.order_patterns_summary.total_orders > 0 || input.upsell_performance_summary.shown > 0
    ? "data_driven"
    : "cold_start";
}

function modeFromParsed(parsed: unknown, fallback: "cold_start" | "data_driven"): "cold_start" | "data_driven" {
  if (!parsed || typeof parsed !== "object") return fallback;
  const mode = (parsed as { mode?: unknown }).mode;
  return mode === "cold_start" || mode === "data_driven" ? mode : fallback;
}

export async function POST(request: Request) {
  try {
    const db = createAdminClient();
    const authed = await requireStaff(db, request);
    if (!authed) return NextResponse.json({ error: "Staff login required." }, { status: 401 });

    const menuResult = await fetchMenu(db);
    if (!menuResult.ok) {
      return NextResponse.json({ error: menuResult.error }, { status: 503 });
    }

    const [rulesResult, eventsResult, itemsResult] = await Promise.all([
      db
        .from("upsell_rules")
        .select("id,trigger_type,trigger_id,suggest_type,suggest_id,priority,reason_template")
        .eq("active", true)
        .order("priority", { ascending: true }),
      db
        .from("upsell_events")
        .select("rule_id,suggested_type,suggested_id,suggested_name,accepted,revenue_impact")
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("order_items")
        .select("order_id,item_type,item_id,item_name,quantity")
        .limit(1000),
    ]);

    if (rulesResult.error || eventsResult.error || itemsResult.error) {
      return NextResponse.json({ error: "Could not load upsell source data." }, { status: 503 });
    }

    const inputSummary: InputSummary = {
      menu_items: compactMenu(menuResult.menu),
      current_rules: (rulesResult.data ?? []) as CurrentRuleRow[],
      upsell_performance_summary: buildPerformanceSummary((eventsResult.data ?? []) as UpsellEventSummaryRow[]),
      order_patterns_summary: buildOrderPatternSummary((itemsResult.data ?? []) as OrderItemSummaryRow[]),
    };

    const openRouter = await callOpenRouter(inputSummary);
    let generatedRules = validateGeneratedRules(openRouter.parsed, menuResult.menu);
    let source = "openrouter";
    if (generatedRules.length === 0) {
      generatedRules = deterministicRuleDrafts(menuResult.menu);
      source = "fallback";
    }

    if (generatedRules.length === 0) {
      return NextResponse.json({ error: "No valid upsell rules could be generated." }, { status: 422 });
    }

    const mode = modeFromParsed(openRouter.parsed, modeFromInput(inputSummary));
    const generationResult = await db
      .from("upsell_rule_generations")
      .insert({
        status: "draft",
        mode,
        model: source === "openrouter" ? OPENROUTER_MODEL : "fallback-local",
        input_summary: inputSummary,
        ai_response: openRouter.parsed ?? { source: "fallback", rules: generatedRules },
        error_message: openRouter.error,
      })
      .select("*")
      .single();

    if (generationResult.error || !generationResult.data) {
      return NextResponse.json({ error: "Could not save generated rules." }, { status: 503 });
    }

    const suggestionRows = generatedRules.map((rule: GeneratedUpsellRule) => ({
      generation_id: generationResult.data.id,
      trigger_type: rule.trigger_type,
      trigger_id: rule.trigger_id,
      suggest_type: rule.suggest_type,
      suggest_id: rule.suggest_id,
      reason_template: rule.reason_template,
      priority: rule.priority,
      confidence: rule.confidence,
      active: false,
    }));

    const suggestionsResult = await db
      .from("upsell_rule_suggestions")
      .insert(suggestionRows)
      .select("*")
      .order("priority", { ascending: true });

    if (suggestionsResult.error) {
      await db
        .from("upsell_rule_generations")
        .update({ status: "failed", error_message: "Could not save generated rule suggestions." })
        .eq("id", generationResult.data.id);
      return NextResponse.json({ error: "Could not save generated rule suggestions." }, { status: 503 });
    }

    return NextResponse.json({
      generation: generationResult.data,
      suggestions: suggestionsResult.data ?? [],
      source,
    });
  } catch {
    return NextResponse.json({ error: "Could not generate upsell rules." }, { status: 500 });
  }
}
