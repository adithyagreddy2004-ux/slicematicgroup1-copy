import { config } from "dotenv";
import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { parseMenuFile } from "../lib/menu-parser";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const FILES: { file: string; table: string }[] = [
  { file: "Types_of_Base.txt", table: "bases" },
  { file: "Types_of_Pizza.txt", table: "pizzas" },
  { file: "Types_of_Toppings.txt", table: "toppings" },
];

async function seed() {
  for (const { file, table } of FILES) {
    const fullPath = path.join(process.cwd(), "data", file);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf8");
    } catch {
      console.error(`Cannot read ${fullPath} — file missing?`);
      process.exit(1);
    }

    const { items, skipped } = parseMenuFile(content);
    for (const line of skipped) {
      console.warn(`  [${file}] skipped malformed line: "${line}"`);
    }
    if (items.length === 0) {
      console.error(`  [${file}] contained no valid items — aborting.`);
      process.exit(1);
    }

    const { error } = await supabase.from(table).upsert(items, { onConflict: "id" });
    if (error) {
      console.error(`  [${table}] upsert failed: ${error.message}`);
      process.exit(1);
    }
    console.log(`  [${table}] seeded ${items.length} items (${skipped.length} skipped).`);
  }
  console.log("Seed complete.");
}

seed();
