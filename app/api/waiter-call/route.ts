import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateTableId } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    let body: { tableId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const tableCheck = validateTableId(body?.tableId);
    if (!tableCheck.ok) {
      return NextResponse.json({ error: tableCheck.error }, { status: 400 });
    }

    const db = createAdminClient();
    const inserted = await db
      .from("waiter_calls")
      .insert({ table_id: body.tableId!.trim() })
      .select("id")
      .single();
    if (inserted.error) {
      return NextResponse.json(
        { error: "Could not reach the staff right now. Please try again." },
        { status: 503 }
      );
    }

    return NextResponse.json({ callId: inserted.data.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
