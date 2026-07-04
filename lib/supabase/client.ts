import { createClient } from "@supabase/supabase-js";

// Anon-key client for the browser: menu reads, staff auth, realtime subscriptions.
// RLS protects everything; anon users can only read menu tables.
// Placeholders keep `next build` working before keys exist; with placeholders,
// requests fail and the UI shows its friendly retry states instead of crashing.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key"
);
