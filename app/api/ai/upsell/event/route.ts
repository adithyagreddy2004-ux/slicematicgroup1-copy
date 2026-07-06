import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMenu } from "@/lib/upsell-server";
import { buildCanonicalUpsellDraft, getItemByType, type MenuItemType } from "@/lib/upsell";
import { round2 } from "@/lib/pricing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface UpsellEventRecord {
  id: string;
  suggested_type: MenuItemType;
  suggested_id: string;
  suggested_price: number;
}

function revenueImpact(type: MenuItemType, suggestedPrice: number, orderDraft: ReturnType<typeof buildCanonicalUpsellDraft>): number {
  if (!orderDraft.ok) return 0;
  const { order } = orderDraft;
  if (type === "beverage") return round2(suggestedPrice);
  if (type === "topping") return round2(suggestedPrice * order.quantity);
  if (type === "base") return round2(Math.max(0, suggestedPrice - Number(order.base.price)) * order.quantity);
  if (type === "pizza") return round2(Math.max(0, suggestedPrice - Number(order.pizza.price)) * order.quantity);
  return 0;
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { eventId, accepted, orderDraft } = body as {
      eventId?: unknown;
      accepted?: unknown;
      orderDraft?: unknown;
    };

    if (typeof eventId !== "string" || !UUID_RE.test(eventId)) {
      return NextResponse.json({ error: "Invalid upsell event." }, { status: 400 });
    }
    if (typeof accepted !== "boolean") {
      return NextResponse.json({ error: "Accepted must be true or false." }, { status: 400 });
    }

    const db = createAdminClient();
    const eventResult = await db
      .from("upsell_events")
      .select("id,suggested_type,suggested_id,suggested_price")
      .eq("id", eventId)
      .single();

    if (eventResult.error || !eventResult.data) {
      return NextResponse.json({ error: "Upsell event was not found." }, { status: 404 });
    }

    const event = eventResult.data as UpsellEventRecord;
    let quantity: number | null = null;
    let impact = 0;

    if (accepted) {
      const menuResult = await fetchMenu(db);
      if (menuResult.ok) {
        const canonical = buildCanonicalUpsellDraft(orderDraft, menuResult.menu);
        const suggested = getItemByType(menuResult.menu, event.suggested_type, event.suggested_id);
        if (canonical.ok && suggested) {
          quantity = canonical.order.quantity;
          impact = revenueImpact(event.suggested_type, Number(suggested.price), canonical);
        }
      }
    }

    const update = await db
      .from("upsell_events")
      .update({
        accepted,
        quantity,
        revenue_impact: impact,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId);

    if (update.error) {
      return NextResponse.json({ error: "Could not update upsell event." }, { status: 503 });
    }

    return NextResponse.json({ ok: true, revenueImpact: impact });
  } catch {
    return NextResponse.json({ error: "Could not update upsell event." }, { status: 500 });
  }
}
