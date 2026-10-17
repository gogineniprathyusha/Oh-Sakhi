import { createClient } from "@supabase/supabase-js";
import { deleteAccountHandler } from "./handler.ts";
const settings = { auth: { persistSession: false, autoRefreshToken: false } };
Deno.serve(
  deleteAccountHandler(
    () =>
      createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        settings,
      ),
    () =>
      createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        settings,
      ),
  ),
);
