import { createClient } from "@supabase/supabase-js";
import { eventEmailsHandler } from "./handler.ts";
Deno.serve(
  eventEmailsHandler(
    () =>
      createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        {
          auth: { persistSession: false, autoRefreshToken: false },
        },
      ),
    () => ({
      apiKey: Deno.env.get("RESEND_API_KEY")!,
      from: Deno.env.get("EMAIL_FROM")!,
      replyTo: Deno.env.get("EMAIL_REPLY_TO")!,
      appUrl: Deno.env.get("APP_BASE_URL")!,
    }),
  ),
);
