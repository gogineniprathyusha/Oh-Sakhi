import { useRef, useState, type FormEvent } from "react";
import {
  deleteAccount,
  deletionSummary,
  type DeletionSummary,
} from "./account-api.ts";
export function DeleteAccount({
  deleted,
  busy = false,
}: {
  deleted: () => Promise<void>;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [summary, setSummary] = useState<DeletionSummary | null>(null),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function inspect() {
    setOpen(true);
    setLoading(true);
    setSummary(null);
    setError("");
    try {
      setSummary(await deletionSummary());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to load account details.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      lock.current ||
      !summary ||
      summary.is_admin ||
      summary.upcoming_events > 0
    )
      return;
    const form = event.currentTarget,
      values = new FormData(form);
    const password = String(values.get("password") ?? ""),
      confirmation = String(values.get("confirmation") ?? "");
    if (confirmation !== "DELETE") {
      setError("Type DELETE exactly to confirm.");
      return;
    }
    if (values.get("understand") !== "yes") {
      setError("Confirm that you understand what will be removed.");
      return;
    }
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      await deleteAccount(password, confirmation);
      form.reset();
      await deleted();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Deletion could not finish. Retry or contact support.",
      );
      const field = form.elements.namedItem("password");
      if (field instanceof HTMLInputElement) field.value = "";
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  return (
    <section className="box account-deletion" aria-labelledby="delete-title">
      <h2 id="delete-title">Delete account</h2>
      <p>Permanent removal of your account and associated community data.</p>
      {!open ? (
        <button
          className="btn btn-outline"
          disabled={busy}
          onClick={() => void inspect()}
        >
          Delete my account
        </button>
      ) : (
        <>
          {loading && <p role="status">Checking your account…</p>}
          {summary && (
            <>
              <p>
                Your account has {summary.hosted_events} hosted event(s) and{" "}
                {summary.rsvps} RSVP record(s).
              </p>
              {summary.is_admin ? (
                <p className="detail-note">
                  Administrator accounts need the community owner to transfer
                  responsibilities and remove the administrator role before
                  deletion.
                </p>
              ) : summary.upcoming_events > 0 ? (
                <p className="detail-note">
                  Cancel your {summary.upcoming_events} upcoming published
                  event(s) from Host desk before deleting your account. If your
                  access is suspended, contact support for help.
                </p>
              ) : (
                <>
                  {summary.deleting && (
                    <p className="detail-note">
                      Deletion has started and account access is locked. Retry
                      below to finish. Files already removed cannot be restored.
                    </p>
                  )}
                  <p>
                    This removes your sign-in, profile, photos, RSVPs, submitted
                    reports and hosted events, including those events’ attendee
                    records and covers. Your reserved seats at other events are
                    released. Security audit records and provider backups may
                    remain as described in our{" "}
                    <a href="/privacy">Privacy Policy</a>.
                  </p>
                  <form onSubmit={submit}>
                    <fieldset
                      className="profile-fields"
                      disabled={saving || busy}
                    >
                      <div className="field">
                        <label htmlFor="delete-password">
                          Current password
                        </label>
                        <input
                          id="delete-password"
                          name="password"
                          type="password"
                          autoComplete="current-password"
                          required
                          maxLength={1024}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="delete-confirmation">
                          Type DELETE to confirm
                        </label>
                        <input
                          id="delete-confirmation"
                          name="confirmation"
                          required
                          autoComplete="off"
                          pattern="DELETE"
                        />
                      </div>
                      <label className="consent">
                        <input
                          name="understand"
                          type="checkbox"
                          value="yes"
                          required
                        />{" "}
                        I understand this is permanent and removes my hosted
                        events and their attendee history.
                      </label>
                      <button className="btn" type="submit">
                        {saving ? "Deleting…" : "Permanently delete my account"}
                      </button>
                    </fieldset>
                  </form>
                </>
              )}
            </>
          )}
          {error && <p role="alert">{error}</p>}
          {!summary && !loading && (
            <button className="btn btn-outline" onClick={() => void inspect()}>
              Retry account check
            </button>
          )}
          <p className="small muted">
            Need help?{" "}
            <a href="mailto:whiteperall@gmail.com">whiteperall@gmail.com</a>
          </p>
          <button
            className="link-btn"
            disabled={saving || loading}
            onClick={() => {
              setOpen(false);
              setError("");
            }}
          >
            Keep my account
          </button>
        </>
      )}
    </section>
  );
}
