import { useState } from "react";
import { exportAttendees } from "../../lib/community-api.ts";
import { downloadAttendees } from "./attendee-csv.ts";
export function AttendeeExport({ eventId }: { eventId: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState("");
  const [confirmed, setConfirmed] = useState(true);
  async function download() {
    if (busy) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const rows = await exportAttendees(eventId);
      downloadAttendees(eventId, rows, confirmed);
      setDone("Attendee CSV downloaded. Keep this member information private.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to export attendees.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="attendee-export">
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={(event) => setConfirmed(event.target.checked)}
        />{" "}
        Confirmed attendees only
      </label>
      <button
        className="btn btn-outline btn-small"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "Exporting…" : "Download attendee CSV"}
      </button>
      {error && <p role="alert">{error}</p>}
      {done && (
        <p role="status" className="small muted">
          {done}
        </p>
      )}
    </div>
  );
}
