export const EVENT_TIMEZONE = "America/New_York";
const parts = (instant: Date, timeZone: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, value]),
  );
export function localDateTime(iso: string, timeZone = EVENT_TIMEZONE) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const p = parts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
/** Resolve a Richmond wall time independently of the visitor's browser timezone.
 * Reject DST gaps and ambiguous fall-back times rather than silently moving a plan. */
export function eventInstant(value: string, timeZone = EVENT_TIMEZONE) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw Error("Choose a valid date and time.");
  const wall = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wall)) throw Error("Choose a valid date and time.");
  const offsets = new Set<number>();
  for (const hours of [-24, 0, 24]) {
    const probe = new Date(wall + hours * 3600000);
    const p = parts(probe, timeZone);
    offsets.add(
      Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) -
        probe.getTime(),
    );
  }
  const matches = [...offsets]
    .map((offset) => new Date(wall - offset))
    .filter((date) => localDateTime(date.toISOString(), timeZone) === value);
  if (matches.length !== 1)
    throw Error(
      matches.length
        ? "This time occurs twice when daylight saving ends. Choose a different time."
        : "This time does not exist when daylight saving begins. Choose a different time.",
    );
  return matches[0].toISOString();
}
export function deadlineLabel(iso: string, timeZone = EVENT_TIMEZONE) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
export function eventTimezoneName(
  date = "",
  time = "",
  timeZone = EVENT_TIMEZONE,
) {
  let instant = new Date();
  let timeZoneName: "long" | "longGeneric" = "long";
  try {
    if (date)
      instant = new Date(eventInstant(`${date}T${time || "12:00"}`, timeZone));
  } catch {
    // An incomplete or ambiguous form value has no reliable daylight-saving offset.
    timeZoneName = "longGeneric";
  }
  return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")!.value;
}
