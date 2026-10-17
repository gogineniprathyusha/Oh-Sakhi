import { useRef, useState } from "react";
import { preparePhoto } from "./photo-file.ts";
interface Props {
  hasPhoto: boolean;
  busy: boolean;
  loading: boolean;
  previewError: string;
  retry: () => void;
  change: (image: Blob | null) => Promise<void>;
  cleanupPending: boolean;
  cleanup: () => void;
}
export function PhotoEditor({
  hasPhoto,
  busy,
  loading,
  previewError,
  retry,
  change,
  cleanupPending,
  cleanup,
}: Props) {
  const input = useRef<HTMLInputElement>(null),
    [preparing, setPreparing] = useState(false),
    [error, setError] = useState("");
  async function select(file: File | undefined) {
    if (!file || preparing || busy || cleanupPending) return;
    setPreparing(true);
    setError("");
    try {
      await change(await preparePhoto(file));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Your photo could not be saved.",
      );
    } finally {
      setPreparing(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="profile-photo-editor">
      <p className="small muted">
        Your photo is private. JPEG, PNG or WebP, up to 2 MiB. Photos are
        resized and their original metadata is removed.
      </p>
      <div className="detail-actions">
        <button
          className="btn btn-outline btn-small"
          type="button"
          disabled={busy || preparing || cleanupPending}
          onClick={() => input.current?.click()}
        >
          {preparing
            ? "Preparing photo…"
            : busy
              ? "Saving…"
              : hasPhoto
                ? "Replace photo"
                : "Upload photo"}
        </button>
        {hasPhoto && (
          <button
            className="link-btn"
            type="button"
            disabled={busy || preparing || cleanupPending}
            onClick={() => {
              setError("");
              void change(null).catch((error) =>
                setError(
                  error instanceof Error
                    ? error.message
                    : "Your photo could not be removed.",
                ),
              );
            }}
          >
            Remove photo
          </button>
        )}
      </div>
      <input
        className="visually-hidden"
        ref={input}
        type="file"
        aria-label="Profile photo file"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        disabled={busy || preparing || cleanupPending}
        onChange={(event) => void select(event.currentTarget.files?.[0])}
      />
      {loading && (
        <p className="small muted" role="status">
          Loading your photo…
        </p>
      )}
      {previewError && (
        <div>
          <p role="alert">{previewError}</p>
          <button
            className="link-btn"
            type="button"
            onClick={retry}
            disabled={busy || preparing}
          >
            Retry photo
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {cleanupPending && (
        <div>
          <p role="status">An unused photo still needs to be removed.</p>
          <button
            className="link-btn"
            type="button"
            disabled={busy || preparing}
            onClick={cleanup}
          >
            Retry removal
          </button>
        </div>
      )}
    </div>
  );
}
