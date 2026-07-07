import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Lets the customer's confirmation screen follow the kitchen's real status.
// Orders are staff-only under RLS, so the customer (anon) can't read the row
// directly — this returns ONLY the status enum for a known order id, nothing
// else (no name/phone/total).
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid order id." }, { status: 400 });
  }
  try {
    const db = createAdminClient();
    const { data, error } = await db.from("orders").select("status").eq("id", id).single();
    if (error || !data) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    return NextResponse.json({ status: data.status });
  } catch {
    return NextResponse.json({ error: "Could not read status." }, { status: 500 });
  }
}
