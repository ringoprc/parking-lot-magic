import { useCallback, useEffect, useRef } from "react";
import { makeAnalyticsId, sendJourneyEvent } from "../utils/analytics";

function visibleDurationMs(open, at = Date.now(), pause = false) {
  let duration = open.accumulatedVisibleMs;
  if (open.visibleStartedAt != null) {
    duration += Math.max(at - open.visibleStartedAt, 0);
    if (pause) {
      open.accumulatedVisibleMs = duration;
      open.visibleStartedAt = null;
    }
  }
  return Math.round(duration);
}

export default function LotViewTracker({ active, apiBase }) {
  const openRef = useRef(null);

  const closeOpenLot = useCallback((reason) => {
    const open = openRef.current;
    if (!open) return;

    openRef.current = null;
    sendJourneyEvent(apiBase, {
      eventType: "lot_close",
      lotId: open.lotId,
      interactionId: open.interactionId,
      durationMs: visibleDurationMs(open, Date.now(), true),
      reason,
    });
  }, [apiBase]);

  const openLot = useCallback((lot) => {
    if (!lot?.lotId || openRef.current?.lotId === lot.lotId) return;

    const interactionId = makeAnalyticsId();
    openRef.current = {
      lotId: lot.lotId,
      interactionId,
      accumulatedVisibleMs: 0,
      visibleStartedAt: document.hidden ? null : Date.now(),
    };

    fetch(`${apiBase}/api/analytics/lot-view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lotId: lot.lotId }),
      keepalive: true,
    }).catch(() => {
      // Analytics must never interrupt the map experience.
    });

    sendJourneyEvent(apiBase, {
      eventType: "lot_open",
      lotId: lot.lotId,
      interactionId,
      durationMs: 0,
    });
  }, [apiBase]);

  useEffect(() => {
    const lotId = active?.lotId || null;
    const open = openRef.current;

    if (open?.lotId === lotId) return;
    if (open) closeOpenLot(lotId ? "lot_changed" : "card_closed");
    if (lotId) openLot(active);
  }, [active, closeOpenLot, openLot]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const open = openRef.current;
      if (!open) return;

      if (document.hidden) {
        visibleDurationMs(open, Date.now(), true);
      } else if (open.visibleStartedAt == null) {
        open.visibleStartedAt = Date.now();
      }
    };

    const onPageHide = () => closeOpenLot("page_exit");
    const onPageShow = (event) => {
      if (event.persisted && active && !openRef.current) {
        openLot(active);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [active, closeOpenLot, openLot]);

  return null;
}
