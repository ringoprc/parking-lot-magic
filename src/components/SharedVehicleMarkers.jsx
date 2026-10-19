import { memo, useEffect, useMemo, useState } from 'react';
import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import SharedVehicleMarkerContent from './SharedVehicleMarkerContent';
import { applyNearbyResult, locationRequest, pruneSharedLocations } from '../utils/locationSharing';

const SharedVehicleMarker = memo(function SharedVehicleMarker({ lat, lng, vehicleModel, vehicleType }) {
  // Match parking dots: map pans and expiry checks must not reassign marker.position.
  const position = useMemo(() => ({ lat, lng }), [lat, lng]);
  return <AdvancedMarker position={position} zIndex={1500}>
    <SharedVehicleMarkerContent vehicleModel={vehicleModel} vehicleType={vehicleType} />
  </AdvancedMarker>;
});

export default function SharedVehicleMarkers({ user, apiBase }) {
  const map = useMap();
  const [locations, setLocations] = useState([]);
  const base = import.meta.env.DEV ? apiBase.replace(/\/$/, '') : '';
  useEffect(() => {
    if (!user?.id || !map) return;
    let disposed = false;
    let busy = false;
    let version = 0;
    const controller = new AbortController();
    async function refresh() {
      if (disposed || busy || document.visibilityState !== 'visible') return;
      const center = map.getCenter();
      if (!center) return;
      busy = true;
      const current = version;
      try {
        const data = await locationRequest(base, user.id, 'nearby', { lat: center.lat(), lng: center.lng() }, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        if (!disposed && current === version && Array.isArray(data.locations)) setLocations(rows => applyNearbyResult(rows, data));
      } catch (error) {
        if (!disposed && current === version) setLocations(rows => applyNearbyResult(rows, { error }));
      } finally { busy = false; }
    }
    const onVisibility = () => {
      version++;
      setLocations(rows => pruneSharedLocations(rows));
      if (document.visibilityState === 'visible') void refresh();
    };
    const interval = window.setInterval(refresh, 5000);
    const expiry = window.setInterval(() => setLocations(rows => pruneSharedLocations(rows)), 1000);
    const listener = map.addListener('idle', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    void refresh();
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(interval); window.clearInterval(expiry);
      listener.remove(); document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [map, user?.id, base]);
  if (!user?.id) return null;
  return locations.map(location => <SharedVehicleMarker key={location.id}
    lat={location.lat} lng={location.lng} vehicleModel={location.vehicleModel} vehicleType={location.vehicleType} />);
}
