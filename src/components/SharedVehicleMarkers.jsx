import { useEffect, useState } from 'react';
import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { FiTruck } from 'react-icons/fi';
import { locationRequest } from '../utils/locationSharing';

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
        if (!disposed && current === version) setLocations(data.locations);
      } catch {
        if (!disposed) setLocations([]);
      } finally { busy = false; }
    }
    const onVisibility = () => {
      version++;
      setLocations([]);
      if (document.visibilityState === 'visible') void refresh();
    };
    const interval = window.setInterval(refresh, 5000);
    const expiry = window.setInterval(() => setLocations(rows => rows.filter(row => Date.parse(row.expiresAt) > Date.now())), 1000);
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
  return locations.map(location => <AdvancedMarker key={location.id}
    position={{ lat: location.lat, lng: location.lng }} zIndex={1500}>
    <div className="shared-vehicle-marker" title={`其他用戶 · ${location.vehicleModel}`}>
      <span className="shared-vehicle-icon"><FiTruck aria-hidden="true" /></span>
      <span className="shared-vehicle-label">{location.vehicleModel}</span>
    </div>
  </AdvancedMarker>);
}
