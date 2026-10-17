import { readAuthCallback } from "./auth-callback.ts";
import { createClient } from "@supabase/supabase-js";
import { hasSupabaseConfig } from "./supabase-config.ts";
export const authCallback = readAuthCallback(new URL(window.location.href));
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = hasSupabaseConfig(url, key);
export const supabase = configured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
