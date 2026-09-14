let pageViewId = null;
let pageEnterEventId = null;
let visitorId = null;
let sessionId = null;

export function makeAnalyticsId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getStoredId(storage, key) {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;

    const id = makeAnalyticsId();
    storage.setItem(key, id);
    return id;
  } catch {
    return makeAnalyticsId();
  }
}

export function getAnalyticsContext() {
  if (!pageViewId) pageViewId = makeAnalyticsId();
  if (!visitorId) visitorId = getStoredId(window.localStorage, "parkingjiVisitorId");
  if (!sessionId) sessionId = getStoredId(window.sessionStorage, "parkingjiSessionId");

  return {
    visitorId,
    sessionId,
    pageViewId,
  };
}

export function getPageEnterEventId() {
  if (!pageEnterEventId) pageEnterEventId = makeAnalyticsId();
  return pageEnterEventId;
}

export function sendJourneyEvent(apiBase, event, eventId = makeAnalyticsId()) {
  const context = getAnalyticsContext();

  return fetch(`${apiBase}/api/analytics/event`, {
    method: "POST",
    // text/plain keeps unload-time events CORS-simple, avoiding a preflight
    // that the browser may cancel while the page is closing.
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({
      ...event,
      ...context,
      eventId,
      path: window.location.pathname,
      clientTimestamp: Date.now(),
    }),
    keepalive: true,
  }).catch(() => {
    // Analytics must never interrupt the map experience.
  });
}
