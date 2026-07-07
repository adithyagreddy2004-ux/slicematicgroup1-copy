import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/upsell-server";
import { parseMenuFile } from "@/lib/menu-parser";

const TABLES = ["bases", "pizzas", "toppings", "beverages"] as const;
type MenuTable = (typeof TABLES)[number];

// Staff-only menu upload. Accepts the raw text of a `ID ; Name ; Price` file,
// parses it defensively (malformed/missing-field lines are skipped and reported,
// never crash), and upserts the valid rows into the chosen menu table by id.
// An all-invalid or empty file is rejected so the live menu is never wiped.
export async function POST(request: NextRequest) {
  const db = createAdminClient();
  const authed = await requireStaff(db, request);
  if (!authed) {
    return NextResponse.json({ error: "Staff login required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { table, content } = (body ?? {}) as { table?: unknown; content?: unknown };
  if (typeof table !== "string" || !TABLES.includes(table as MenuTable)) {
    return NextResponse.json({ error: "Choose a valid menu category." }, { status: 400 });
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "The file is empty." }, { status: 400 });
  }

  const { items, skipped } = parseMenuFile(content);
  if (items.length === 0) {
    return NextResponse.json(
      {
        error: "No valid rows found — every line was malformed. Menu left unchanged.",
        skipped,
      },
      { status: 422 }
    );
  }

  // De-dupe by id within the file (last one wins) so upsert doesn't error.
  const byId = new Map(items.map((i) => [i.id, i]));
  const rows = [...byId.values()];

  const { error } = await db.from(table).upsert(rows, { onConflict: "id" });
  if (error) {
    return NextResponse.json({ error: "Could not save the menu." }, { status: 503 });
  }

  return NextResponse.json({
    table,
    upserted: rows.length,
    skipped, // malformed lines, so the admin can see exactly what was ignored
  });
}
