// frontend/src/hooks/useLots.jsx
import { useCallback, useEffect, useState } from "react";

export function useLots({
  apiBase = "",
  area = "Zhongshan",
  center = null,     // { lat, lng } or null
  radiusM = 2500,
  pollMs = 15000,
}) {

  const [lots, setLots] = useState([]);

  const loadLots = useCallback(async () => {
    const qs =
	  center?.lat != null && center?.lng != null
	    ? `lat=${encodeURIComponent(center.lat)}&lng=${encodeURIComponent(center.lng)}&radiusM=${encodeURIComponent(radiusM)}`
	    : `area=${encodeURIComponent(area)}`;

	const res = await fetch(`${apiBase}/api/lots?${qs}`);
    const data = await res.json();
    setLots(data.results || []);
  }, [apiBase, area, center?.lat, center?.lng, radiusM]);

  useEffect(() => {
    loadLots();
    const t = setInterval(loadLots, pollMs);
    return () => clearInterval(t);
  }, [loadLots, pollMs]);

  return { lots, reload: loadLots };
}