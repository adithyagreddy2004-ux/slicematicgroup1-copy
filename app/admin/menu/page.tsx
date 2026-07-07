"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRequireAuth } from "@/components/staff/useRequireAuth";
import StaffHeader from "@/components/staff/StaffHeader";
import { formatINR } from "@/lib/pricing";
import type { MenuItem } from "@/lib/types";

const CATEGORIES = [
  { table: "bases", label: "Bases", file: "Types_of_Base.txt" },
  { table: "pizzas", label: "Pizzas", file: "Types_of_Pizza.txt" },
  { table: "toppings", label: "Toppings", file: "Types_of_Toppings.txt" },
  { table: "beverages", label: "Beverages", file: "Types_of_Beverages.txt" },
] as const;

type Table = (typeof CATEGORIES)[number]["table"];

interface UploadResult {
  upserted: number;
  skipped: string[];
}

export default function MenuAdminPage() {
  const auth = useRequireAuth();
  const [table, setTable] = useState<Table>("bases");
  const [counts, setCounts] = useState<Record<Table, MenuItem[]>>({
    bases: [], pizzas: [], toppings: [], beverages: [],
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    Promise.all([
      supabase.from("bases").select("id,name,price").order("price"),
      supabase.from("pizzas").select("id,name,price").order("price"),
      supabase.from("toppings").select("id,name,price").order("price"),
      supabase.from("beverages").select("id,name,price").order("price"),
    ]).then(([b, p, t, d]) => {
      setCounts({
        bases: (b.data as MenuItem[]) ?? [],
        pizzas: (p.data as MenuItem[]) ?? [],
        toppings: (t.data as MenuItem[]) ?? [],
        beverages: (d.data as MenuItem[]) ?? [],
      });
    });
  }, []);

  useEffect(() => {
    if (auth !== "authed") return;
    refresh();
  }, [auth, refresh]);

  async function upload() {
    setError(null);
    setResult(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Pick a .txt menu file first.");
      return;
    }
    setBusy(true);
    try {
      const content = await file.text();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/admin/menu", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ table, content }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Upload failed.");
        if (Array.isArray(json.skipped)) setResult({ upserted: 0, skipped: json.skipped });
        return;
      }
      setResult({ upserted: json.upserted, skipped: json.skipped ?? [] });
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch {
      setError("Could not read or upload the file.");
    } finally {
      setBusy(false);
    }
  }

  if (auth !== "authed") {
    return <p className="p-10 text-center text-zinc-400">Checking access…</p>;
  }

  const current = counts[table];
  const expectedFile = CATEGORIES.find((c) => c.table === table)?.file;

  return (
    <main className="min-h-dvh">
      <StaffHeader title="Admin — Menu" />
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-zinc-500">
          Upload a menu file (<code>ID ; Name ; Price</code> per line) to update the live menu
          — no code change or redeploy. Rows are matched by <code>ID</code>: existing ids are
          updated, new ids added. Malformed lines (missing field, non-number price) are skipped
          and listed below; a file with zero valid rows is rejected so the menu is never wiped.
        </p>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-400">Category</span>
              <select
                value={table}
                onChange={(e) => { setTable(e.target.value as Table); setResult(null); setError(null); }}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.table} value={c.table}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-400">File ({expectedFile})</span>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,text/plain"
                className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-white/20"
              />
            </label>
            <button
              onClick={upload}
              disabled={busy}
              className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              {busy ? "Uploading…" : "Upload & update"}
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          {result && (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
              <p className="text-emerald-400">
                {result.upserted > 0
                  ? `Updated ${result.upserted} item${result.upserted > 1 ? "s" : ""} in ${table}.`
                  : "No items updated."}
              </p>
              {result.skipped.length > 0 && (
                <div className="mt-2">
                  <p className="text-amber-400">Skipped {result.skipped.length} malformed line(s):</p>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs text-zinc-400">
                    {result.skipped.map((line, i) => (
                      <li key={i} className="font-mono">• {line || "(blank)"}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">
            Current {CATEGORIES.find((c) => c.table === table)?.label} ({current.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr><th className="py-2 pr-4">ID</th><th className="py-2 pr-4">Name</th><th className="py-2 text-right">Price</th></tr>
              </thead>
              <tbody>
                {current.map((item) => (
                  <tr key={item.id} className="border-t border-white/5">
                    <td className="py-2 pr-4 font-mono text-zinc-400">{item.id}</td>
                    <td className="py-2 pr-4">{item.name}</td>
                    <td className="py-2 text-right">{formatINR(Number(item.price))}</td>
                  </tr>
                ))}
                {current.length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center text-zinc-500">No items yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
