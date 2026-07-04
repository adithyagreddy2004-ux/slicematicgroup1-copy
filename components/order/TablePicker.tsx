"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validateTableId } from "@/lib/validation";

export default function TablePicker() {
  const router = useRouter();
  const [table, setTable] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const check = validateTableId(table);
    if (!check.ok) {
      setError("Please enter the table number shown on your table (e.g. 12).");
      return;
    }
    router.replace(`/order?table=${encodeURIComponent(table.trim())}`);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={handleSubmit} noValidate className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold">Which table are you at?</h1>
        <p className="text-sm text-zinc-400">
          We couldn&apos;t detect your table from the QR code. Enter it below to continue.
        </p>
        <input
          value={table}
          onChange={(e) => setTable(e.target.value)}
          placeholder="Table number"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center outline-none focus:border-[var(--accent)]"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" className="w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-black">
          Continue
        </button>
      </form>
    </main>
  );
}
