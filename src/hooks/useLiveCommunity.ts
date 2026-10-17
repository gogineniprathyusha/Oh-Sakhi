import { useCallback, useEffect, useRef, useState } from "react";
import { loadCommunity } from "../lib/community-api.ts";
export function useLiveCommunity(userId: string | undefined) {
  const [owner, setOwner] = useState<string>();
  const [data, setData] = useState<Awaited<
    ReturnType<typeof loadCommunity>
  > | null>(null);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const refresh = useCallback(async () => {
    if (currentUser.current !== userId) return false;
    const ticket = ++generation.current;
    if (!userId) {
      setData(null);
      setError("");
      setLoading(false);
      return false;
    }
    setLoading(true);
    setError("");
    try {
      const loaded = await loadCommunity(userId);
      if (ticket === generation.current && currentUser.current === userId) {
        setOwner(userId);
        setData(loaded);
        return true;
      }
      return false;
    } catch (error) {
      if (ticket === generation.current)
        setError(
          error instanceof Error
            ? error.message
            : "Unable to load your community.",
        );
      return false;
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  const setAvatarPath = useCallback(
    (path: string | null) => {
      if (currentUser.current !== userId) return;
      setData((previous) =>
        previous
          ? { ...previous, profile: { ...previous.profile, avatar_path: path } }
          : previous,
      );
    },
    [userId],
  );
  return {
    data: owner === userId ? data : null,
    error,
    loading,
    refresh,
    setAvatarPath,
    setCoverPath: (id: string, path: string | null) => {
      if (currentUser.current !== userId) return;
      setData((previous) =>
        previous
          ? {
              ...previous,
              events: previous.events.map((event) =>
                event.id === id ? { ...event, cover_path: path } : event,
              ),
            }
          : previous,
      );
    },
  };
}
