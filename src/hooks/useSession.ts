import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase.ts";
export function useSession(onRecovery: () => void) {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUser(data.session?.user ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") onRecovery();
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [onRecovery]);
  return user;
}
