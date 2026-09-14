// frontend/src/hooks/useLots.jsx
import { useCallback, useEffect, useState } from "react";
import {
  hasNumberedAvailability,
  mergeLotDisplayAvailability,
} from "../utils/availability";

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
  const [globalNumberedCount, setGlobalNumberedCount] = useState(0);
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

    const nextLots = data.results || [];
    setLots(nextLots);
    setMeta(data.meta || null);
    if (data.meta?.totalActive === nextLots.length) {
      setGlobalNumberedCount(
        nextLots.filter(hasNumberedAvailability).length
      );
    }
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
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      applyDisplayRows(rows);

      const summaryCount = Number(data?.meta?.numberedCount);
      setGlobalNumberedCount(
        Number.isInteger(summaryCount) && summaryCount >= 0
          ? summaryCount
          : rows.filter((row) =>
              hasNumberedAvailability(row?.display)
            ).length
      );
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
    globalNumberedCount,
    lastFrontendFetchAt,
    reload: loadLots,
    applyDisplayAvailability,
  };
}
