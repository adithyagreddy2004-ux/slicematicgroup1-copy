import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMenu } from "@/lib/upsell-server";
import type { Menu } from "@/lib/types";
import {
  CUSTOMER_UPSELL_SYSTEM_PROMPT,
  buildCanonicalUpsellDraft,
  cartSignature,
  deterministicRuleDrafts,
  fallbackUpsellMessage,
  parseJsonObject,
  selectUpsellCandidate,
  wordCount,
  type UpsellCandidate,
  type UpsellOrderDraft,
  type UpsellRule,
} from "@/lib/upsell";

const OPENROUTER_MODEL = "openai/gpt-4o-mini";

interface UpsellRuleRow {
  id: string;
  trigger_type: UpsellRule["trigger_type"];
  trigger_id: string | null;
  suggest_type: UpsellRule["suggest_type"];
  suggest_id: string;
  priority: number;
  min_quantity: number;
  max_quantity: number | null;
  reason_template: string | null;
}

function normalizeRules(rows: UpsellRuleRow[]): UpsellRule[] {
  return rows.map((row) => ({
    id: row.id,
    trigger_type: row.trigger_type,
    trigger_id: row.trigger_id,
    suggest_type: row.suggest_type,
    suggest_id: row.suggest_id,
    priority: Number(row.priority),
    min_quantity: Number(row.min_quantity ?? 1),
    max_quantity: row.max_quantity === null ? null : Number(row.max_quantity),
    reason_template: row.reason_template ?? "This item pairs well with the selected order.",
  }));
}

function buildFallbackRules(menu: Menu): UpsellRule[] {
  return deterministicRuleDrafts(menu).map((rule, index) => ({
    id: `fallback-${index + 1}`,
    trigger_type: rule.trigger_type,
    trigger_id: rule.trigger_id,
    suggest_type: rule.suggest_type,
    suggest_id: rule.suggest_id,
    priority: rule.priority,
    min_quantity: 1,
    max_quantity: null,
    reason_template: rule.reason_template,
  }));
}

function userPrompt(order: UpsellOrderDraft, candidate: UpsellCandidate): string {
  return `Current order:
Base: ${order.base.name}
Pizza: ${order.pizza.name}
Toppings already selected: ${order.toppings.length > 0 ? order.toppings.map((item) => item.name).join(", ") : "None"}
Beverages already selected: ${order.beverages.length > 0 ? order.beverages.map((item) => item.name).join(", ") : "None"}
Quantity: ${order.quantity}

Candidate upsell item:
Type: ${candidate.suggestType}
Name: ${candidate.item.name}
Price: INR ${candidate.item.price}

Backend reason: ${candidate.rule.reason_template}

Write one helpful upsell sentence as JSON only.`;
}

async function callOpenRouter(order: UpsellOrderDraft, candidate: UpsellCandidate): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return fallbackUpsellMessage(order, candidate);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        "X-Title": "SliceMatic Smart Upselling Assistant",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: CUSTOMER_UPSELL_SYSTEM_PROMPT },
          { role: "user", content: userPrompt(order, candidate) },
        ],
        temperature: 0.3,
        max_tokens: 120,
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) return fallbackUpsellMessage(order, candidate);
    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return fallbackUpsellMessage(order, candidate);

    const parsed = parseJsonObject(content);
    if (!parsed || typeof parsed !== "object") return fallbackUpsellMessage(order, candidate);

    const message = (parsed as { message?: unknown }).message;
    if (typeof message !== "string") return fallbackUpsellMessage(order, candidate);

    const trimmed = message.trim();
    if (!trimmed || trimmed.length > 180 || wordCount(trimmed) > 25) {
      return fallbackUpsellMessage(order, candidate);
    }
    return trimmed;
  } catch {
    clearTimeout(timeout);
    return fallbackUpsellMessage(order, candidate);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ hasSuggestion: false, error: "Invalid request body." }, { status: 400 });
    }

    const db = createAdminClient();
    const menuResult = await fetchMenu(db);
    if (!menuResult.ok) {
      return NextResponse.json({ hasSuggestion: false, error: menuResult.error }, { status: 503 });
    }

    const orderDraft = body && typeof body === "object" && "orderDraft" in body
      ? (body as { orderDraft?: unknown }).orderDraft
      : body;
    const draftResult = buildCanonicalUpsellDraft(orderDraft, menuResult.menu);
    if (!draftResult.ok) {
      return NextResponse.json({ hasSuggestion: false, error: draftResult.error }, { status: 400 });
    }

    const { data: ruleRows } = await db
      .from("upsell_rules")
      .select("id,trigger_type,trigger_id,suggest_type,suggest_id,priority,min_quantity,max_quantity,reason_template")
      .eq("active", true)
      .order("priority", { ascending: true });

    const rules = ruleRows && ruleRows.length > 0
      ? normalizeRules(ruleRows as UpsellRuleRow[])
      : buildFallbackRules(menuResult.menu);
    const candidate = selectUpsellCandidate(draftResult.order, rules, menuResult.menu);
    if (!candidate) {
      return NextResponse.json({ hasSuggestion: false, message: "No relevant upsell found." });
    }

    const aiMessage = await callOpenRouter(draftResult.order, candidate);
    const signature = cartSignature(draftResult.order);
    const inserted = await db
      .from("upsell_events")
      .insert({
        rule_id: candidate.rule.id.startsWith("fallback-") ? null : candidate.rule.id,
        cart_signature: signature,
        suggested_type: candidate.suggestType,
        suggested_id: candidate.item.id,
        suggested_name: candidate.item.name,
        suggested_price: candidate.item.price,
        ai_message: aiMessage,
        displayed: true,
        accepted: null,
      })
      .select("id")
      .single();

    return NextResponse.json({
      hasSuggestion: true,
      suggestedType: candidate.suggestType,
      suggestedItem: candidate.item,
      message: aiMessage,
      ruleId: candidate.rule.id,
      eventId: inserted.error ? null : inserted.data.id,
    });
  } catch {
    return NextResponse.json(
      { hasSuggestion: false, error: "Upsell assistant failed safely." },
      { status: 500 }
    );
  }
}
