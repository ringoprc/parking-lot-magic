import { useEffect } from "react";

const trackedLoads = new Set();

function makeAnonymousId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getStoredId(storage, key) {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;

    const id = makeAnonymousId();
    storage.setItem(key, id);
    return id;
  } catch {
    return makeAnonymousId();
  }
}

export default function VisitTracker({ apiBase }) {
  useEffect(() => {
    const loadKey = `${window.location.pathname}:${window.location.search}`;
    if (trackedLoads.has(loadKey)) return;
    trackedLoads.add(loadKey);

    const visitorId = getStoredId(window.localStorage, "parkingjiVisitorId");
    const sessionId = getStoredId(window.sessionStorage, "parkingjiSessionId");

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
  }, [apiBase]);

  return null;
}
