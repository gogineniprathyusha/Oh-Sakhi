// Vite's VITE_ variables are public: accept browser keys only.
export function hasSupabaseConfig(
  url: string | undefined,
  key: string | undefined,
) {
  if (!url || !key || url.includes("YOUR_PROJECT") || key.includes("YOUR_"))
    return false;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (key.startsWith("sb_secret_")) return false;
    if (key.startsWith("eyJ")) {
      const payload = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.role !== "anon") return false;
    }
    return key.startsWith("sb_publishable_") || key.startsWith("eyJ");
  } catch {
    return false;
  }
}
