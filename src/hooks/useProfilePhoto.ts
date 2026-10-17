import { useCallback, useEffect, useState } from "react";
import { downloadPhoto } from "../features/profile/profile-api.ts";
interface State {
  userId?: string;
  path?: string;
  url?: string;
  error: string;
  loading: boolean;
}
/** Object URLs are local to this browser session and revoked on replacement/logout. */
export function useProfilePhoto(
  userId: string | undefined,
  path: string | null | undefined,
) {
  const [state, setState] = useState<State>({ error: "", loading: false });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    if (!userId || !path) return;
    let active = true,
      objectUrl: string | undefined;
    setState({ userId, path, error: "", loading: true });
    void downloadPhoto(userId, path)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ userId, path, url: objectUrl, error: "", loading: false });
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            userId,
            path,
            error:
              error instanceof Error
                ? error.message
                : "Your photo could not be loaded.",
            loading: false,
          });
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, path, attempt]);
  const matches = Boolean(
    userId && path && state.userId === userId && state.path === path,
  );
  return {
    url: matches ? state.url : undefined,
    error: matches ? state.error : "",
    loading: Boolean(userId && path) && (!matches || state.loading),
    retry,
  };
}
