// frontend/src/hooks/useLots.jsx
import { useCallback, useEffect, useState } from "react";

export function useLots({
  apiBase = "",
  district = "中山區",
  center = null,     // { lat, lng } or null
  radiusM = 2500,
  pollMs = 15000,
}) {

  const [lots, setLots] = useState([]);
  const [meta, setMeta] = useState(null);

  const loadLots = useCallback(async () => {
    const qs =
	  center?.lat != null && center?.lng != null
	    ? `lat=${encodeURIComponent(center.lat)}&lng=${encodeURIComponent(center.lng)}&radiusM=${encodeURIComponent(radiusM)}`
	    : `district=${encodeURIComponent(district)}`;

	const res = await fetch(`${apiBase}/api/lots?${qs}`);
    const data = await res.json();

    console.log('data:', data);

    setLots(data.results || []);
    setMeta(data.meta || null);
  }, [apiBase, district, center?.lat, center?.lng, radiusM]);

  useEffect(() => {
    loadLots();
    const t = setInterval(loadLots, pollMs);
    return () => clearInterval(t);
  }, [loadLots, pollMs]);

  return { lots, meta, reload: loadLots };
}