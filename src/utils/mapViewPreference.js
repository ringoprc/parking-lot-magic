export function isValidMapView(view) {
  return !!view && [view.lat, view.lng, view.zoom].every(Number.isFinite) &&
    Math.abs(view.lat) <= 90 && Math.abs(view.lng) <= 180 && view.zoom >= 0 && view.zoom <= 24;
}

// Keep only the latest pending view and serialize writes so a slow older
// request cannot overwrite a newer view from this map.
export function createMapViewSaver({ userId, base, initialView, request = fetch }) {
  let saved = isValidMapView(initialView) ? JSON.stringify(initialView) : null;
  let pending = null;
  let running = null;
  let stopped = false;

  async function drain() {
    while (pending && !stopped) {
      const view = pending;
      pending = null;
      const key = JSON.stringify(view);
      if (key === saved) continue;
      try {
        const response = await request(`${base}/api/auth/map-view`, {
          method: "POST", credentials: "include", keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, mapView: view }),
          signal: AbortSignal.timeout(10000),
        });
        if (response.status === 401 || response.status === 409) {
          stopped = true;
          pending = null;
          return;
        }
        if (response.ok) saved = key;
        // Failed writes are retried on the next idle, hide, or logout event.
      } catch {
        // Preference failures should not interrupt map browsing or logout.
      }
    }
  }

  return {
    save(view) {
      if (stopped || !isValidMapView(view)) return Promise.resolve();
      pending = { lat: view.lat, lng: view.lng, zoom: view.zoom };
      if (!running) running = drain().finally(() => { running = null; });
      return running;
    },
    stop() { stopped = true; pending = null; },
  };
}
