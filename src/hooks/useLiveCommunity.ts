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
  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    if (!userId) {
      setData(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const loaded = await loadCommunity(userId);
      if (ticket === generation.current) {
        setOwner(userId);
        setData(loaded);
      }
    } catch (error) {
      if (ticket === generation.current)
        setError(
          error instanceof Error
            ? error.message
            : "Unable to load your community.",
        );
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
  return { data: owner === userId ? data : null, error, loading, refresh };
}
