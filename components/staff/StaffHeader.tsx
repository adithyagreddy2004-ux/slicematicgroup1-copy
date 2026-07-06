"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function StaffHeader({ title }: { title: string }) {
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/10 bg-black/70 px-6 py-4 backdrop-blur-xl">
      <h1 className="text-lg font-bold">{title}</h1>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/kitchen" className="text-zinc-300 hover:text-white">Kitchen</Link>
        <Link href="/admin" className="text-zinc-300 hover:text-white">Admin</Link>
        <Link href="/admin/upsell" className="text-zinc-300 hover:text-white">Upsell</Link>
        <button onClick={signOut} className="rounded-lg border border-white/15 px-3 py-1 text-zinc-300 hover:border-[var(--accent)]">
          Sign out
        </button>
      </nav>
    </header>
  );
}
