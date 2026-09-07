import { useEffect, useRef } from "react";

export default function LotViewTracker({ active, apiBase }) {
  const openLotIdRef = useRef(null);

  useEffect(() => {
    const lotId = active?.lotId || null;

    if (!lotId) {
      openLotIdRef.current = null;
      return;
    }
    if (openLotIdRef.current === lotId) return;
    openLotIdRef.current = lotId;

    fetch(`${apiBase}/api/analytics/lot-view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lotId }),
      keepalive: true,
    }).catch(() => {
      // Analytics must never interrupt the map experience.
    });
  }, [active?.lotId, apiBase]);

  return null;
}
