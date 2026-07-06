import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Menu } from "@/lib/types";

export async function fetchMenu(db: SupabaseClient): Promise<{ ok: true; menu: Menu } | { ok: false; error: string }> {
  const [bases, pizzas, toppings, beverages] = await Promise.all([
    db.from("bases").select("id,name,price"),
    db.from("pizzas").select("id,name,price"),
    db.from("toppings").select("id,name,price"),
    db.from("beverages").select("id,name,price"),
  ]);

  if (bases.error || pizzas.error || toppings.error || beverages.error) {
    return { ok: false, error: "Menu is temporarily unavailable." };
  }

  return {
    ok: true,
    menu: {
      bases: bases.data,
      pizzas: pizzas.data,
      toppings: toppings.data,
      beverages: beverages.data,
    },
  };
}

export async function requireStaff(db: SupabaseClient, request: Request): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  const { data, error } = await db.auth.getUser(match[1]);
  return !error && Boolean(data.user);
}
