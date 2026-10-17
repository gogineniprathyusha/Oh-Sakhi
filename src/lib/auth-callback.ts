/** Inspect auth intent before the SDK consumes and removes URL tokens. */
export function readAuthCallback(url: URL) {
  const hash = new URLSearchParams(url.hash.slice(1));
  const recovery =
    url.searchParams.get("recovery") === "1" || hash.get("type") === "recovery";
  const failed = ["error", "error_code", "error_description"].some(
    (key) => url.searchParams.has(key) || hash.has(key),
  );
  return {
    recovery,
    error: failed
      ? recovery
        ? "This password reset link is invalid or has expired. Request a new reset link."
        : "This sign-in link is invalid or has expired. Please try signing in again."
      : "",
  };
}

/** Remove auth callback data while retaining unrelated query parameters/anchors. */
export function withoutAuthCallback(url: URL) {
  const clean = new URL(url);
  for (const key of [
    "recovery",
    "code",
    "error",
    "error_code",
    "error_description",
  ])
    clean.searchParams.delete(key);
  const hash = new URLSearchParams(clean.hash.slice(1));
  if (
    [
      "access_token",
      "refresh_token",
      "error",
      "error_code",
      "error_description",
      "type",
    ].some((key) => hash.has(key))
  )
    clean.hash = "";
  return `${clean.pathname}${clean.search}${clean.hash}`;
}
