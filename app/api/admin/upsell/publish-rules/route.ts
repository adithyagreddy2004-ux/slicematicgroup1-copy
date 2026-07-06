import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMenu, requireStaff } from "@/lib/upsell-server";
import { validateGeneratedRules } from "@/lib/upsell";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SuggestionRow {
  id: string;
  generation_id: string;
  trigger_type: "base" | "pizza" | "topping" | "beverage";
  trigger_id: string;
  suggest_type: "base" | "pizza" | "topping" | "beverage";
  suggest_id: string;
  reason_template: string;
  priority: number;
  confidence: "high" | "medium" | "low";
}

export async function POST(request: Request) {
  try {
    const db = createAdminClient();
    const authed = await requireStaff(db, request);
    if (!authed) return NextResponse.json({ error: "Staff login required." }, { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const generationId = body && typeof body === "object"
      ? (body as { generationId?: unknown }).generationId
      : null;
    if (typeof generationId !== "string" || !UUID_RE.test(generationId)) {
      return NextResponse.json({ error: "Invalid rule generation." }, { status: 400 });
    }

    const menuResult = await fetchMenu(db);
    if (!menuResult.ok) {
      return NextResponse.json({ error: menuResult.error }, { status: 503 });
    }

    const suggestionsResult = await db
      .from("upsell_rule_suggestions")
      .select("*")
      .eq("generation_id", generationId)
      .order("priority", { ascending: true });

    if (suggestionsResult.error) {
      return NextResponse.json({ error: "Could not load generated rules." }, { status: 503 });
    }

    const suggestions = (suggestionsResult.data ?? []) as SuggestionRow[];
    const validRules = validateGeneratedRules(
      suggestions.map((suggestion) => ({
        trigger_type: suggestion.trigger_type,
        trigger_id: suggestion.trigger_id,
        suggest_type: suggestion.suggest_type,
        suggest_id: suggestion.suggest_id,
        priority: suggestion.priority,
        reason_template: suggestion.reason_template,
        confidence: suggestion.confidence,
      })),
      menuResult.menu
    );

    if (validRules.length === 0) {
      return NextResponse.json({ error: "No valid generated rules to publish." }, { status: 422 });
    }

    const insertResult = await db
      .from("upsell_rules")
      .insert(
        validRules.map((rule) => ({
          generation_id: generationId,
          trigger_type: rule.trigger_type,
          trigger_id: rule.trigger_id,
          suggest_type: rule.suggest_type,
          suggest_id: rule.suggest_id,
          priority: rule.priority,
          min_quantity: 1,
          max_quantity: null,
          reason_template: rule.reason_template,
          active: false,
          source: "ai",
        }))
      )
      .select("*");

    if (insertResult.error) {
      return NextResponse.json({ error: "Could not publish generated rules." }, { status: 503 });
    }

    const insertedIds = (insertResult.data ?? []).map((rule: { id: string }) => rule.id);
    const deactivate = await db.from("upsell_rules").update({ active: false }).eq("active", true);
    if (deactivate.error) {
      return NextResponse.json({ error: "Could not deactivate old rules." }, { status: 503 });
    }

    await Promise.all([
      db.from("upsell_rules").update({ active: true }).in("id", insertedIds),
      db
        .from("upsell_rule_suggestions")
        .update({ active: true })
        .eq("generation_id", generationId),
      db
        .from("upsell_rule_generations")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", generationId),
    ]);

    return NextResponse.json({
      rules: (insertResult.data ?? []).map((rule) => ({ ...rule, active: true })),
    });
  } catch {
    return NextResponse.json({ error: "Could not publish upsell rules." }, { status: 500 });
  }
}
