import { useRef, useState } from "react";
import type { CommunityEvent } from "./types.ts";
import { preparePhoto } from "../profile/photo-file.ts";
import { changeCover, CoverChangeError, MAX_COVER_BYTES } from "./cover-api.ts";
import { EventArtwork } from "./EventArtwork.tsx";
export function CoverEditor({
  event,
  saved,
}: {
  event: CommunityEvent;
  saved: (path: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [cleanup, setCleanup] = useState<string>();
  async function change(file?: File, remove = false) {
    if (busy || (!file && !remove)) return;
    setBusy(true);
    setError("");
    try {
      const image = file
        ? await preparePhoto(file, MAX_COVER_BYTES, 1600)
        : null;
      const result = await changeCover(
        event.id,
        event.cover_path ?? null,
        image,
      );
      setCleanup(result.cleanupPath);
      saved(result.path);
    } catch (error) {
      if (error instanceof CoverChangeError && error.cleanupPath)
        setCleanup(error.cleanupPath);
      setError(
        error instanceof Error
          ? error.message
          : "Your cover could not be saved.",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <section className="cover-editor" aria-label="Event cover">
      <h3>Event cover</h3>
      <p className="small muted">
        JPEG, PNG or WebP, up to 5 MiB. Covers appear wherever this event is
        visible. Image changes save separately from the form above.
      </p>
      {event.cover_path && <EventArtwork event={event} detail />}
      <div className="detail-actions">
        <button
          className="btn btn-outline btn-small"
          disabled={busy || Boolean(cleanup)}
          onClick={() => input.current?.click()}
        >
          {busy
            ? "Saving cover…"
            : event.cover_path
              ? "Replace cover"
              : "Upload cover"}
        </button>
        {event.cover_path && (
          <button
            className="link-btn"
            disabled={busy || Boolean(cleanup)}
            onClick={() => void change(undefined, true)}
          >
            Remove cover
          </button>
        )}
      </div>
      <input
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Event cover file"
        tabIndex={-1}
        ref={input}
        disabled={busy || Boolean(cleanup)}
        onChange={(e) => void change(e.currentTarget.files?.[0])}
      />
      {error && <p role="alert">{error}</p>}
      {cleanup && (
        <>
          <p role="status">An unused cover still needs to be removed.</p>
          <button
            className="link-btn"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              void changeCover(
                event.id,
                event.cover_path ?? null,
                null,
                cleanup,
              )
                .then(() => setCleanup(undefined))
                .catch((error) =>
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Cleanup could not finish.",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            Retry cover removal
          </button>
        </>
      )}
    </section>
  );
}
