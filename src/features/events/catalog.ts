// Category artwork uses the approved cream, blush and rose palette.
export const categories = [
  "Coffee",
  "Wellness",
  "Food",
  "Creative",
  "Social",
] as const;
export const themes: Record<string, [string, string, string]> = {
  Coffee: ["☕", "#f8c6cd", "#fde7e4"],
  Wellness: ["🌿", "#fde7e4", "#fdf6f2"],
  Food: ["🍝", "#e49cae", "#fde7e4"],
  Creative: ["🎨", "#fde7e4", "#f8c6cd"],
  Social: ["✨", "#f8c6cd", "#fff1ee"],
};

export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
