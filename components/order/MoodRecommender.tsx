"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatINR } from "@/lib/pricing";
import type { MenuItem } from "@/lib/types";
import type { MoodItemType } from "@/lib/mood";

interface MoodSuggestion {
  type: MoodItemType;
  item: MenuItem;
  reason: string;
}

interface MoodResponse {
  suggestions: MoodSuggestion[];
  source: "openrouter" | "fallback";
}

const TYPE_LABELS: Record<MoodItemType, string> = {
  base: "Base",
  pizza: "Pizza",
  topping: "Topping",
  beverage: "Drink",
};

const IDLE_PROMPTS = [
  "Still choosing? Tell us your mood and we can narrow the menu.",
  "Food fact: spicy flavours often feel brighter when paired with a cool drink.",
  "Not sure yet? A mood word is enough. Try cozy, hungry, fresh, or excited.",
  "Tiny shortcut: comfort moods usually love warm crust, cheese, and familiar flavours.",
];

export default function MoodRecommender({
  onPick,
  selectedIds,
}: {
  onPick: (type: MoodItemType, id: string) => void;
  selectedIds: Record<MoodItemType, string[]>;
}) {
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState("");
  const [suggestions, setSuggestions] = useState<MoodSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUsedMatcher, setHasUsedMatcher] = useState(false);
  const [idlePromptIndex, setIdlePromptIndex] = useState(0);
  const [idlePrompt, setIdlePrompt] = useState(IDLE_PROMPTS[0]);
  const [promptCount, setPromptCount] = useState(0);

  const hasSuggestions = suggestions.length > 0;
  const trimmedMood = useMemo(() => mood.trim(), [mood]);
  const allSuggestionsSelected = hasSuggestions && suggestions.every((suggestion) => isSelected(suggestion));

  useEffect(() => {
    if (hasUsedMatcher) return;
    const timer = window.setInterval(() => {
      setPromptCount((current) => current + 1);
      const prompt = IDLE_PROMPTS[idlePromptIndex % IDLE_PROMPTS.length];
      setIdlePrompt(prompt);
      setIdlePromptIndex((current) => current + 1);
      setOpen(true);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [hasUsedMatcher, idlePromptIndex]);

  function markUsed() {
    setHasUsedMatcher(true);
  }

  async function requestSuggestions() {
    markUsed();
    if (!trimmedMood) {
      setError("Type a mood first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/mood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: trimmedMood }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not read that mood right now.");
        return;
      }
      const next = (data as MoodResponse).suggestions ?? [];
      setSuggestions(next);
      if (next.length === 0) {
        setError("No menu picks matched that mood. Try another word.");
      }
    } catch {
      setError("Could not reach the mood matcher.");
    } finally {
      setLoading(false);
    }
  }

  function pickSuggestion(suggestion: MoodSuggestion) {
    markUsed();
    onPick(suggestion.type, suggestion.item.id);
  }

  function applyFullSet() {
    markUsed();
    for (const suggestion of suggestions) {
      onPick(suggestion.type, suggestion.item.id);
    }
  }

  function isSelected(suggestion: MoodSuggestion) {
    return selectedIds[suggestion.type].includes(suggestion.item.id);
  }

  return (
    <div className="fixed bottom-56 right-4 z-40 flex max-w-[calc(100vw-2rem)] justify-end sm:bottom-52 sm:right-6">
      <AnimatePresence mode="wait">
        {!open ? (
          <motion.button
            key="closed"
            type="button"
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              setOpen(true);
            }}
            className="rounded-full border border-[var(--accent)]/40 bg-black/75 px-4 py-2 text-sm font-semibold text-[var(--accent)] shadow-[0_0_22px_rgba(255,92,26,0.22)] backdrop-blur-xl transition hover:border-[var(--accent)]"
          >
            {idlePromptIndex > 0 ? "Need a mood match?" : "Match my mood"}
          </motion.button>
        ) : (
          <motion.div
            key={`open-${promptCount}`}
            initial={{ opacity: 0, scale: 0.95, y: promptCount === 1 ? 96 : 10 }}
            animate={{
              opacity: 1,
              scale: promptCount > 1 && !hasUsedMatcher ? [1, 1.015, 1] : 1,
              y: 0,
              boxShadow: promptCount > 1 && !hasUsedMatcher
                ? [
                    "0 18px 50px rgba(0,0,0,0.45), 0 0 0 rgba(255,92,26,0)",
                    "0 18px 50px rgba(0,0,0,0.45), 0 0 28px rgba(255,92,26,0.42)",
                    "0 18px 50px rgba(0,0,0,0.45), 0 0 0 rgba(255,92,26,0)",
                  ]
                : "0 18px 50px rgba(0,0,0,0.45)",
            }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: promptCount === 1 ? 0.45 : 0.35, ease: "easeOut" }}
            className="w-[21rem] max-w-full rounded-2xl border border-white/10 bg-black/85 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                  Mood matcher
                </p>
                <p className="mt-1 text-sm text-zinc-300">
                  {idlePromptIndex > 0 && !hasUsedMatcher
                    ? idlePrompt
                    : "Tell us the vibe. We'll point you at a few picks."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                }}
                className="rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-400 transition hover:border-white/30 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="flex gap-2">
              <input
                value={mood}
                onChange={(e) => {
                  markUsed();
                  setMood(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void requestSuggestions();
                }}
                maxLength={120}
                placeholder="spicy, cozy, fresh..."
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none transition placeholder:text-zinc-600 focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={requestSuggestions}
                disabled={loading}
                className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
              >
                {loading ? "..." : "Ask"}
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

            {hasSuggestions && (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={applyFullSet}
                  disabled={allSuggestionsSelected}
                  className="w-full rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black transition disabled:opacity-60"
                >
                  {allSuggestionsSelected ? "Mood set added" : "Add full mood set"}
                </button>
                {suggestions.map((suggestion) => {
                  const selected = isSelected(suggestion);
                  return (
                    <button
                      key={`${suggestion.type}:${suggestion.item.id}`}
                      type="button"
                      onClick={() => pickSuggestion(suggestion)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selected
                          ? "border-[var(--accent)]/50 bg-[var(--accent)]/10"
                          : "border-white/10 bg-white/5 hover:border-white/25"
                      }`}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                            {TYPE_LABELS[suggestion.type]}
                          </span>
                          <span className="block truncate text-sm font-semibold text-zinc-100">
                            {suggestion.item.name}
                          </span>
                          <span className="mt-1 block text-xs text-zinc-400">
                            {suggestion.reason}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-[var(--accent)]">
                          {selected ? "Added" : formatINR(Number(suggestion.item.price))}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
