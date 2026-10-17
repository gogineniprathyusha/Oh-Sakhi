import { createClient } from "@supabase/supabase-js";
import { initializeImageMagick } from "@imagemagick/magick-wasm";
import { eventImageHandler } from "./handler.ts";

const wasm = await Deno.readFile(
  new URL("x86/magick.wasm", import.meta.resolve("@imagemagick/magick-wasm")),
);
await initializeImageMagick(wasm);
Deno.serve(
  eventImageHandler(() =>
    createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    ),
  ),
);
