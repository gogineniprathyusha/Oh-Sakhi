import { useCallback, useEffect, useRef, useState } from "react";
import { loadPublicEvents } from "../lib/community-api.ts";
import { configured } from "../lib/supabase.ts";
import type { CommunityEvent } from "../features/events/types.ts";

export function usePublicEvents(enabled: boolean) {
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const active = useRef(enabled);
  active.current = enabled;
  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    if (!enabled || !active.current || !configured) return;
    setLoading(true);
    setError("");
    try {
      const loaded = await loadPublicEvents();
      if (active.current && generation.current === ticket) setEvents(loaded);
    } catch {
      if (active.current && generation.current === ticket)
        setError("We couldn’t load experiences. Please try again.");
    } finally {
      if (active.current && generation.current === ticket) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [enabled]);
  useEffect(() => {
    setEvents([]);
    setError("");
    setLoading(false);
    setLoaded(false);
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  return {
    events: enabled ? events : [],
    loading,
    loaded,
    error: configured
      ? error
      : "Experiences are temporarily unavailable. Please check back soon.",
    refresh,
  };
}
