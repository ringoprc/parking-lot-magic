// frontend/src/hooks/useLots.jsx
import { useCallback, useEffect, useState } from "react";
import { mergeLotDisplayAvailability } from "../utils/availability";

export function useLots({
  apiBase = "",
  district = null,
  center = null,     // { lat, lng } or null
  radiusM = 2500,
  pollMs = 15000,
  availabilityPollMs = 15000,
}) {

  const [lots, setLots] = useState([]);
  const [meta, setMeta] = useState(null);
  const [lastFrontendFetchAt, setLastFrontendFetchAt] = useState(null);
  const centerLat = center?.lat;
  const centerLng = center?.lng;

  const loadLots = useCallback(async () => {
    const qs =
      centerLat != null && centerLng != null
        ? `lat=${encodeURIComponent(centerLat)}&lng=${encodeURIComponent(centerLng)}&radiusM=${encodeURIComponent(radiusM)}`
        : (district ? `district=${encodeURIComponent(district)}` : "");

    const url = qs ? `${apiBase}/api/lots?${qs}` : `${apiBase}/api/lots`;
    const res = await fetch(url);
    const data = await res.json();

    console.log('data:', data);

    setLots(data.results || []);
    setMeta(data.meta || null);
    setLastFrontendFetchAt(new Date().toISOString());
  }, [apiBase, district, centerLat, centerLng, radiusM]);

  useEffect(() => {
    const initial = window.setTimeout(loadLots, 0);
    const t = setInterval(loadLots, pollMs);
    return () => {
      window.clearTimeout(initial);
      clearInterval(t);
    };
  }, [loadLots, pollMs]);

  const applyDisplayRows = useCallback((rows) => {
    const displayByLotId = new Map(
      (Array.isArray(rows) ? rows : [])
        .filter((row) => row?.lotId && row?.display)
        .map((row) => [row.lotId, row.display])
    );
    if (!displayByLotId.size) return;

    setLots((current) => {
      let changed = false;
      const next = current.map((lot) => {
        const display = displayByLotId.get(lot.lotId);
        if (!display) return lot;
        const merged = mergeLotDisplayAvailability(lot, display);
        if (merged !== lot) changed = true;
        return merged;
      });
      return changed ? next : current;
    });
  }, []);

  const applyDisplayAvailability = useCallback((lotId, display) => {
    applyDisplayRows([{ lotId, display }]);
  }, [applyDisplayRows]);

  const loadAvailability = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/lots/availability`);
      if (!response.ok) return;
      const data = await response.json();
      applyDisplayRows(data?.rows);
    } catch {
      // The next lightweight poll retries; keep the last rendered snapshot.
    }
  }, [apiBase, applyDisplayRows]);

  useEffect(() => {
    const interval = window.setInterval(loadAvailability, availabilityPollMs);
    return () => window.clearInterval(interval);
  }, [availabilityPollMs, loadAvailability]);

  return {
    lots,
    meta,
    lastFrontendFetchAt,
    reload: loadLots,
    applyDisplayAvailability,
  };
}
