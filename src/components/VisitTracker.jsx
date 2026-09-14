import { useEffect, useRef } from "react";
import {
  getAnalyticsContext,
  getPageEnterEventId,
  sendJourneyEvent,
} from "../utils/analytics";

const trackedLoads = new Set();
const HEARTBEAT_INTERVAL_MS = 30_000;

export default function VisitTracker({ apiBase }) {
  const timingRef = useRef(null);

  useEffect(() => {
    const loadKey = `${window.location.pathname}:${window.location.search}`;
    const { visitorId, sessionId } = getAnalyticsContext();

    if (!trackedLoads.has(loadKey)) {
      trackedLoads.add(loadKey);

      fetch(`${apiBase}/api/analytics/visit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId,
          sessionId,
          path: window.location.pathname,
        }),
        keepalive: true,
      }).catch(() => {
        // Analytics must never interrupt the map experience.
      });
    }

    const now = Date.now();
    timingRef.current = {
      accumulatedVisibleMs: 0,
      visibleStartedAt: document.hidden ? null : now,
      exited: false,
    };

    const visibleDurationMs = (at = Date.now(), pause = false) => {
      const timing = timingRef.current;
      if (!timing) return 0;

      let duration = timing.accumulatedVisibleMs;
      if (timing.visibleStartedAt != null) {
        duration += Math.max(at - timing.visibleStartedAt, 0);
        if (pause) {
          timing.accumulatedVisibleMs = duration;
          timing.visibleStartedAt = null;
        }
      }
      return Math.round(duration);
    };

    sendJourneyEvent(
      apiBase,
      { eventType: "page_enter", durationMs: 0 },
      getPageEnterEventId()
    );

    const onVisibilityChange = () => {
      const at = Date.now();
      const timing = timingRef.current;
      if (!timing) return;

      if (document.hidden) {
        sendJourneyEvent(apiBase, {
          eventType: "page_hidden",
          durationMs: visibleDurationMs(at, true),
          reason: "visibility_change",
        });
      } else {
        if (timing.visibleStartedAt == null) timing.visibleStartedAt = at;
        sendJourneyEvent(apiBase, {
          eventType: "page_visible",
          durationMs: visibleDurationMs(at),
          reason: "visibility_change",
        });
      }
    };

    const onPageHide = () => {
      const timing = timingRef.current;
      if (!timing || timing.exited) return;
      timing.exited = true;
      sendJourneyEvent(apiBase, {
        eventType: "page_exit",
        durationMs: visibleDurationMs(Date.now(), true),
        reason: "pagehide",
      });
    };

    const onPageShow = (event) => {
      const timing = timingRef.current;
      if (!timing || !event.persisted) return;
      timing.exited = false;
      if (!document.hidden && timing.visibleStartedAt == null) {
        timing.visibleStartedAt = Date.now();
      }
      sendJourneyEvent(apiBase, {
        eventType: "page_visible",
        durationMs: visibleDurationMs(),
        reason: "bfcache_restore",
      });
    };

    const heartbeat = window.setInterval(() => {
      if (document.hidden || timingRef.current?.exited) return;
      sendJourneyEvent(apiBase, {
        eventType: "page_heartbeat",
        durationMs: visibleDurationMs(),
      });
    }, HEARTBEAT_INTERVAL_MS);

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [apiBase]);

  return null;
}
