import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { authCallback, supabase } from "../lib/supabase.ts";

export function useSession(onRecovery: () => void) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");
  const clearError = useCallback(() => setError(""), []);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true,
      initialized = false,
      revision = 0;
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!active || (!initialized && event === "INITIAL_SESSION")) return;
      revision++;
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") onRecovery();
    });
    void (async () => {
      try {
        const initial = await client.auth.initialize();
        const snapshot = revision;
        const result = await client.auth.getSession();
        if (!active) return;
        initialized = true;
        if (snapshot === revision) setUser(result.data.session?.user ?? null);
        const problem =
          authCallback.error || initial.error?.message || result.error?.message;
        if (problem) setError(problem);
        else if (authCallback.recovery) {
          if (result.data.session) onRecovery();
          else
            setError(
              "This password reset link is missing or has expired. Request a new reset link.",
            );
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to restore your session. Please sign in again.",
          );
      } finally {
        if (active) {
          initialized = true;
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [onRecovery]);
  return { user, loading, error, clearError };
}
