import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
const deployment = JSON.parse(
  readFileSync(new URL("./vercel.json", import.meta.url), "utf8"),
) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const headers = Object.fromEntries(
  deployment.headers.flatMap((rule) =>
    rule.headers.map((header) => [header.key, header.value]),
  ),
);
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["react", "react-dom/client", "@supabase/supabase-js"],
  },
  preview: { headers },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/@supabase/")) return "supabase";
          if (
            id.includes("/node_modules/react") ||
            id.includes("/node_modules/scheduler/")
          )
            return "react";
        },
      },
    },
  },
});
