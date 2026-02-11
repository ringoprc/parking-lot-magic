// frontend/src/hooks/useLots.jsx
import { useCallback, useEffect, useState } from "react";

export function useLots({
  apiBase = "",
  district = null,
  center = null,     // { lat, lng } or null
  radiusM = 2500,
  pollMs = 15000,
}) {

  const [lots, setLots] = useState([]);
  const [meta, setMeta] = useState(null);
  const [lastFrontendFetchAt, setLastFrontendFetchAt] = useState(null);

  const loadLots = useCallback(async () => {
    const qs =
      center?.lat != null && center?.lng != null
        ? `lat=${encodeURIComponent(center.lat)}&lng=${encodeURIComponent(center.lng)}&radiusM=${encodeURIComponent(radiusM)}`
        : (district ? `district=${encodeURIComponent(district)}` : "");

    const url = qs ? `${apiBase}/api/lots?${qs}` : `${apiBase}/api/lots`;
    const res = await fetch(url);
    const data = await res.json();

    console.log('data:', data);

    setLots(data.results || []);
    setMeta(data.meta || null);
    setLastFrontendFetchAt(new Date().toISOString());
  }, [apiBase, district, center?.lat, center?.lng, radiusM]);

  useEffect(() => {
    loadLots();
    const t = setInterval(loadLots, pollMs);
    return () => clearInterval(t);
  }, [loadLots, pollMs]);

  return { lots, meta, lastFrontendFetchAt, reload: loadLots };
}