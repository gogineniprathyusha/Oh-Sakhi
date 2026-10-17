import type { Registration } from "./types.ts";
function cell(value: string) {
  // Quoting alone does not stop spreadsheet formula evaluation, including after whitespace.
  const safe =
    /^[\s\uFEFF]*[=+@-]/u.test(value) || /^[\t\r\n]/u.test(value)
      ? `'${value}`
      : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function attendeeCsv(rows: Registration[], confirmedOnly: boolean) {
  const labels = {
    approved: "Confirmed",
    cancelled: "Cancelled",
    declined: "Not attending",
    pending: "Not confirmed",
  };
  return (
    "\uFEFF" +
    [
      ["Member ID", "Display name", "RSVP status", "Registered at (UTC)"],
      ...rows
        .filter((row) => !confirmedOnly || row.status === "approved")
        .map((row) => [
          row.user_id,
          row.display_name ?? "",
          labels[row.status],
          row.created_at ?? "",
        ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
export function downloadAttendees(
  id: string,
  rows: Registration[],
  confirmedOnly: boolean,
) {
  const url = URL.createObjectURL(
    new Blob([attendeeCsv(rows, confirmedOnly)], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `oh-sakhi-attendees-${id.replace(/[^a-zA-Z0-9_-]/g, "")}-${confirmedOnly ? "confirmed" : "all"}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
