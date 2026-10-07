import { useEffect } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { createMapViewSaver, isValidMapView } from "../utils/mapViewPreference";

export default function MapViewPreference({ user, apiBase, saveRef }) {
  const map = useMap();
  const base = import.meta.env.DEV ? apiBase.replace(/\/$/, "") : "";

  useEffect(() => {
    if (!map || !user?.id) return;
    const initialView = user.mapView;
    // Apply the saved camera before registering any persistence listeners.
    // Session loading and the initial default camera must never overwrite it.
    if (isValidMapView(initialView)) {
      map.moveCamera({ center: { lat: initialView.lat, lng: initialView.lng }, zoom: initialView.zoom });
    }
    const saver = createMapViewSaver({ userId: user.id, base, initialView });
    const save = () => {
      const center = map.getCenter();
      return saver.save({ lat: center?.lat(), lng: center?.lng(), zoom: map.getZoom() });
    };
    const listener = map.addListener("idle", save);
    const onHidden = () => { if (document.visibilityState === "hidden") save(); };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", save);
    saveRef.current = save;
    return () => {
      listener.remove();
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", save);
      if (saveRef.current === save) saveRef.current = null;
      saver.stop();
    };
  }, [map, user, base, saveRef]);

  return null;
}
