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

  const links = [
    { href: "/kitchen", label: "Kitchen" },
    { href: "/admin", label: "Admin" },
    { href: "/admin/analytics", label: "Analytics" },
    { href: "/admin/insights", label: "Insights" },
    { href: "/admin/upsell", label: "Upsell" },
  ];

  return (
    <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/10 bg-black/70 px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-4">
      <h1 className="text-base font-bold sm:text-lg">{title}</h1>
      {/* On narrow screens the nav wraps to its own line and scrolls sideways
          instead of pushing links off the edge of the screen. */}
      <nav className="-mx-1 flex w-full items-center gap-3 overflow-x-auto px-1 text-sm sm:w-auto">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="shrink-0 whitespace-nowrap text-zinc-300 hover:text-white">
            {l.label}
          </Link>
        ))}
        <button
          onClick={signOut}
          className="ml-auto shrink-0 whitespace-nowrap rounded-lg border border-white/15 px-3 py-1 text-zinc-300 hover:border-[var(--accent)] sm:ml-0"
        >
          Sign out
        </button>
      </nav>
    </header>
  );
}
