// frontend/src/utils/geo.jsx
export function toRad(d) {
  return (d * Math.PI) / 180;
}

export function getCurrentPositionAsync(options) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GEOLOCATION_NOT_SUPPORTED"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, thenOptions(options));
  });
}

function thenOptions(opts) {
  return {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 30000,
    ...(opts || {}),
  };
}

// meters
export function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(s));
}