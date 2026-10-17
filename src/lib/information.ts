export const informationPages = {
  privacy: "Privacy Policy",
  terms: "Terms of Use",
  guidelines: "Community guidelines",
  contact: "Contact",
} as const;
export type InformationPage = keyof typeof informationPages;
export function informationPage(path: string): InformationPage | null {
  const key = path.replace(/^\/|\/$/g, "");
  return Object.hasOwn(informationPages, key) ? (key as InformationPage) : null;
}
