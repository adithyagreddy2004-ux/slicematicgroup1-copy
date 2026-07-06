import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildOrder, OrderPayload } from "@/lib/orders";
import type { Menu } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    let payload: OrderPayload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const db = createAdminClient();
    const [bases, pizzas, toppings, beverages] = await Promise.all([
      db.from("bases").select("id,name,price"),
      db.from("pizzas").select("id,name,price"),
      db.from("toppings").select("id,name,price"),
      db.from("beverages").select("id,name,price"),
    ]);
    if (bases.error || pizzas.error || toppings.error || beverages.error) {
      return NextResponse.json(
        { error: "Menu is temporarily unavailable. Please try again in a moment." },
        { status: 503 }
      );
    }

    const menu: Menu = {
      bases: bases.data,
      pizzas: pizzas.data,
      toppings: toppings.data,
      beverages: beverages.data,
    };
    const result = buildOrder(payload, menu);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const inserted = await db.from("orders").insert(result.order).select("id").single();
    if (inserted.error) {
      return NextResponse.json(
        { error: "Could not save your order. Please try again." },
        { status: 503 }
      );
    }

    const itemRows = result.items.map((item) => ({ ...item, order_id: inserted.data.id }));
    const itemsInsert = await db.from("order_items").insert(itemRows);
    if (itemsInsert.error) {
      // Roll back the order header so we never leave a half-saved order.
      await db.from("orders").delete().eq("id", inserted.data.id);
      return NextResponse.json(
        { error: "Could not save your order. Please try again." },
        { status: 503 }
      );
    }

    if (
      typeof payload.acceptedUpsellEventId === "string" &&
      UUID_RE.test(payload.acceptedUpsellEventId)
    ) {
      await db
        .from("upsell_events")
        .update({ order_id: inserted.data.id, updated_at: new Date().toISOString() })
        .eq("id", payload.acceptedUpsellEventId)
        .eq("accepted", true);
    }

    return NextResponse.json({ orderId: inserted.data.id, bill: result.bill }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
