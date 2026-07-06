"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRequireAuth } from "@/components/staff/useRequireAuth";
import StaffHeader from "@/components/staff/StaffHeader";
import { formatINR } from "@/lib/pricing";
import type {
  Menu,
  MenuItem,
  UpsellEventRow,
  UpsellRuleGenerationRow,
  UpsellRuleRow,
  UpsellRuleSuggestionRow,
} from "@/lib/types";

type LoadState = "loading" | "ready" | "error";
type MenuType = UpsellRuleRow["suggest_type"];

const TYPE_LABELS: Record<MenuType, string> = {
  base: "Base",
  pizza: "Pizza",
  topping: "Topping",
  beverage: "Beverage",
};

function buildLookup(menu: Menu | null): Map<string, MenuItem> {
  const lookup = new Map<string, MenuItem>();
  if (!menu) return lookup;
  for (const item of menu.bases) lookup.set(`base:${item.id}`, item);
  for (const item of menu.pizzas) lookup.set(`pizza:${item.id}`, item);
  for (const item of menu.toppings) lookup.set(`topping:${item.id}`, item);
  for (const item of menu.beverages) lookup.set(`beverage:${item.id}`, item);
  return lookup;
}

function itemLabel(lookup: Map<string, MenuItem>, type: string, id: string | null): string {
  if (!id) return "Any item";
  return lookup.get(`${type}:${id}`)?.name ?? id;
}

function pct(accepted: number, shown: number): string {
  if (shown === 0) return "0%";
  return `${Math.round((accepted / shown) * 1000) / 10}%`;
}

function eventStats(events: UpsellEventRow[]) {
  const shown = events.length;
  const accepted = events.filter((event) => event.accepted === true).length;
  const skipped = events.filter((event) => event.accepted === false).length;
  const revenue = events.reduce((sum, event) => sum + Number(event.revenue_impact ?? 0), 0);
  const groups = new Map<string, { name: string; shown: number; accepted: number }>();

  for (const event of events) {
    const key = event.rule_id ?? `${event.suggested_type}:${event.suggested_id}`;
    const existing = groups.get(key) ?? { name: event.suggested_name, shown: 0, accepted: 0 };
    existing.shown += 1;
    if (event.accepted === true) existing.accepted += 1;
    groups.set(key, existing);
  }

  const best = [...groups.values()].sort((a, b) => {
    const aRate = a.shown === 0 ? 0 : a.accepted / a.shown;
    const bRate = b.shown === 0 ? 0 : b.accepted / b.shown;
    return bRate - aRate || b.accepted - a.accepted;
  })[0] ?? null;

  return {
    shown,
    accepted,
    skipped,
    acceptanceRate: pct(accepted, shown),
    revenue,
    best,
  };
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

export default function AdminUpsellPage() {
  const auth = useRequireAuth();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [rules, setRules] = useState<UpsellRuleRow[]>([]);
  const [events, setEvents] = useState<UpsellEventRow[]>([]);
  const [generations, setGenerations] = useState<UpsellRuleGenerationRow[]>([]);
  const [suggestions, setSuggestions] = useState<UpsellRuleSuggestionRow[]>([]);
  const [working, setWorking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = useMemo(() => buildLookup(menu), [menu]);
  const stats = useMemo(() => eventStats(events), [events]);
  const latestGeneration = generations[0] ?? null;

  const refresh = useCallback(() => {
    Promise.all([
      supabase.from("bases").select("id,name,price").order("price"),
      supabase.from("pizzas").select("id,name,price").order("price"),
      supabase.from("toppings").select("id,name,price").order("price"),
      supabase.from("beverages").select("id,name,price").order("price"),
      supabase.from("upsell_rules").select("*").eq("active", true).order("priority", { ascending: true }),
      supabase.from("upsell_events").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("upsell_rule_generations").select("*").order("created_at", { ascending: false }).limit(5),
    ]).then(async ([bases, pizzas, toppings, beverages, rulesRes, eventsRes, generationsRes]) => {
      if (
        bases.error ||
        pizzas.error ||
        toppings.error ||
        beverages.error ||
        rulesRes.error ||
        eventsRes.error ||
        generationsRes.error
      ) {
        setLoadState("error");
        return;
      }

      const loadedGenerations = (generationsRes.data ?? []) as UpsellRuleGenerationRow[];
      let loadedSuggestions: UpsellRuleSuggestionRow[] = [];
      if (loadedGenerations[0]) {
        const suggestionsRes = await supabase
          .from("upsell_rule_suggestions")
          .select("*")
          .eq("generation_id", loadedGenerations[0].id)
          .order("priority", { ascending: true });
        if (!suggestionsRes.error) {
          loadedSuggestions = (suggestionsRes.data ?? []) as UpsellRuleSuggestionRow[];
        }
      }

      setMenu({
        bases: bases.data,
        pizzas: pizzas.data,
        toppings: toppings.data,
        beverages: beverages.data,
      });
      setRules((rulesRes.data ?? []) as UpsellRuleRow[]);
      setEvents((eventsRes.data ?? []) as UpsellEventRow[]);
      setGenerations(loadedGenerations);
      setSuggestions(loadedSuggestions);
      setLoadState("ready");
    });
  }, []);

  useEffect(() => {
    if (auth !== "authed") return;
    refresh();
  }, [auth, refresh]);

  async function staffToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function generateRules() {
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      const token = await staffToken();
      if (!token) {
        setError("Staff login required.");
        return;
      }
      const response = await fetch("/api/admin/upsell/generate-rules", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not generate rules.");
        return;
      }
      setNotice(`Generated ${data.suggestions?.length ?? 0} draft rules.`);
      refresh();
    } catch {
      setError("Could not generate rules.");
    } finally {
      setWorking(false);
    }
  }

  async function publishRules() {
    if (!latestGeneration) return;
    setPublishing(true);
    setError(null);
    setNotice(null);
    try {
      const token = await staffToken();
      if (!token) {
        setError("Staff login required.");
        return;
      }
      const response = await fetch("/api/admin/upsell/publish-rules", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ generationId: latestGeneration.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not publish rules.");
        return;
      }
      setNotice(`Published ${data.rules?.length ?? 0} live rules.`);
      refresh();
    } catch {
      setError("Could not publish rules.");
    } finally {
      setPublishing(false);
    }
  }

  if (auth !== "authed") {
    return <p className="p-10 text-center text-zinc-400">Checking access...</p>;
  }

  return (
    <main className="min-h-dvh">
      <StaffHeader title="Admin - Smart Upselling" />
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        {loadState === "error" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            Could not load upsell data. <button onClick={refresh} className="underline">Retry</button>
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-5">
          <StatCard label="Shown" value={String(stats.shown)} />
          <StatCard label="Accepted" value={String(stats.accepted)} sub={`${stats.skipped} skipped`} />
          <StatCard label="Acceptance" value={stats.acceptanceRate} />
          <StatCard label="Extra revenue" value={formatINR(stats.revenue)} />
          <StatCard
            label="Best rule"
            value={stats.best ? stats.best.name : "None"}
            sub={stats.best ? `${stats.best.accepted}/${stats.best.shown} accepted` : "No events yet"}
          />
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                Rule generator
              </p>
              <h2 className="mt-1 text-xl font-bold">Refresh rules from current menu and sales data</h2>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={generateRules}
                disabled={working}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {working ? "Generating..." : "Generate AI Rules"}
              </button>
              <button
                type="button"
                onClick={publishRules}
                disabled={publishing || !latestGeneration || suggestions.length === 0}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 disabled:opacity-50"
              >
                {publishing ? "Publishing..." : "Publish Draft"}
              </button>
            </div>
          </div>
          {notice && <p className="mt-3 text-sm text-emerald-400">{notice}</p>}
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          {latestGeneration && (
            <p className="mt-3 text-xs text-zinc-500">
              Latest draft: {latestGeneration.mode.replace("_", " ")} · {latestGeneration.model} ·{" "}
              {new Date(latestGeneration.created_at).toLocaleString()}
            </p>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 p-4">
              <h2 className="font-bold">Live checkout rules</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Trigger</th>
                    <th className="px-4 py-3">Suggest</th>
                    <th className="px-4 py-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id} className="border-t border-white/10">
                      <td className="px-4 py-3">
                        <span className="block text-xs text-zinc-500">{rule.trigger_type}</span>
                        {itemLabel(lookup, rule.trigger_type, rule.trigger_id)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-xs text-zinc-500">{TYPE_LABELS[rule.suggest_type]}</span>
                        {itemLabel(lookup, rule.suggest_type, rule.suggest_id)}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{rule.reason_template}</td>
                    </tr>
                  ))}
                  {rules.length === 0 && loadState !== "loading" && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                        No active rules.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 p-4">
              <h2 className="font-bold">Latest draft rules</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Trigger</th>
                    <th className="px-4 py-3">Suggest</th>
                    <th className="px-4 py-3">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((rule) => (
                    <tr key={rule.id} className="border-t border-white/10">
                      <td className="px-4 py-3">
                        <span className="block text-xs text-zinc-500">{TYPE_LABELS[rule.trigger_type]}</span>
                        {itemLabel(lookup, rule.trigger_type, rule.trigger_id)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-xs text-zinc-500">{TYPE_LABELS[rule.suggest_type]}</span>
                        {itemLabel(lookup, rule.suggest_type, rule.suggest_id)}
                        <span className="mt-1 block text-xs text-zinc-500">{rule.reason_template}</span>
                      </td>
                      <td className="px-4 py-3 capitalize">{rule.confidence}</td>
                    </tr>
                  ))}
                  {suggestions.length === 0 && loadState !== "loading" && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                        No draft rules yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
