"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export type AuthStatus = "loading" | "authed" | "anon";

/** Redirects to /login when there is no staff session. */
export function useRequireAuth(): AuthStatus {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? "authed" : "anon");
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? "authed" : "anon");
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (status === "anon") router.replace("/login");
  }, [status, router]);

  return status;
}
