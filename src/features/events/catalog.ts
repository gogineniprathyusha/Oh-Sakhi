// Category artwork retains the original Oh Sakhi visual design.
export const categories = [
  "Coffee",
  "Wellness",
  "Food",
  "Creative",
  "Social",
] as const;
export const themes: Record<string, [string, string, string]> = {
  Coffee: ["☕", "#dcc4bb", "#f5e5da"],
  Wellness: ["🌿", "#c5d5c4", "#e9ede1"],
  Food: ["🍝", "#d6a7a7", "#f7d4c8"],
  Creative: ["🎨", "#e0c3b0", "#f2e1cc"],
  Social: ["✨", "#c8b4cb", "#eee0ef"],
};

export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
