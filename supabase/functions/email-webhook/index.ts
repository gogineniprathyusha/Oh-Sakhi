import { createClient } from "@supabase/supabase-js";
import { emailWebhookHandler } from "./handler.ts";
Deno.serve(
  emailWebhookHandler(
    () =>
      createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        {
          auth: { persistSession: false, autoRefreshToken: false },
        },
      ),
    () => Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "",
  ),
);
