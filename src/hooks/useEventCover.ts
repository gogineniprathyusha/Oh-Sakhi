import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.ts";
/** A local URL follows the same visibility rules as the event's Storage object. */
export function useEventCover(path?: string | null) {
  const [state, setState] = useState<{ path?: string; url?: string }>({});
  useEffect(() => {
    if (!path || !supabase) return;
    let active = true,
      url: string | undefined;
    void supabase.storage
      .from("event-covers")
      .download(path)
      .then(({ data, error }) => {
        if (
          !active ||
          error ||
          !data ||
          !["image/jpeg", "image/png", "image/webp"].includes(data.type) ||
          data.size > 5 * 1024 * 1024
        )
          return;
        url = URL.createObjectURL(data);
        setState({ path, url });
      })
      .catch(() => {
        /* The original artwork remains visible when a cover is unavailable. */
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);
  return path && state.path === path ? state.url : undefined;
}
