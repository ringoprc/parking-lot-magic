// frontend/src/hooks/useLots.jsx
import { useCallback, useEffect, useState } from "react";

export function useLots({ apiBase = "", area = "Zhongshan", pollMs = 15000 }) {
  const [lots, setLots] = useState([]);

  const loadLots = useCallback(async () => {
    const res = await fetch(`${apiBase}/api/lots?area=${encodeURIComponent(area)}`);
    const data = await res.json();
    setLots(data.results || []);
  }, [apiBase, area]);

  useEffect(() => {
    loadLots();
    const t = setInterval(loadLots, pollMs);
    return () => clearInterval(t);
  }, [loadLots, pollMs]);

  return { lots, reload: loadLots };
}