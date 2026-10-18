export const MAX_INTERESTS = 12;
export const MAX_INTEREST_LENGTH = 60;

export function normalizeInterests(names: string[], catalog: string[] = []) {
  const canonical = new Map(catalog.map((name) => [name.toLowerCase(), name]));
  const unique = new Map<string, string>();
  for (const value of names) {
    const name = value.trim(),
      key = name.toLowerCase();
    if (name && !unique.has(key)) unique.set(key, canonical.get(key) ?? name);
  }
  return [...unique.values()];
}

export function interestError(names: string[], catalog: string[] = []) {
  if (names.length > MAX_INTERESTS)
    return "Choose up to 12 interests, including your other interests.";
  const custom = names.filter(
    (name) =>
      !catalog.some((choice) => choice.toLowerCase() === name.toLowerCase()),
  );
  if (custom.some((name) => [...name].length > MAX_INTEREST_LENGTH))
    return "Keep each interest to 60 characters or fewer.";
  if (custom.some((name) => /[\p{Cc},]/u.test(name)))
    return "Use plain text for each interest, separated by commas.";
  return "";
}
