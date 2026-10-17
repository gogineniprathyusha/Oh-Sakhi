export const when = (value: string, timezone?: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone ?? "America/New_York",
  }).format(new Date(value));
