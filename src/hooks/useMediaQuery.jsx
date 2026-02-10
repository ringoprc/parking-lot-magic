// frontend/src/hooks/useMediaQuery.js
import { useSyncExternalStore } from "react";

export function useMediaQuery(query) {
  function getSnapshot() {
    return window.matchMedia(query).matches;
  }

  function subscribe(cb) {
    const mql = window.matchMedia(query);
    // Safari compat
    if (mql.addEventListener) mql.addEventListener("change", cb);
    else mql.addListener(cb);

    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", cb);
      else mql.removeListener(cb);
    };
  }

  // SSR-safe fallback
  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}