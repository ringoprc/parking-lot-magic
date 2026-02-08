// frontend/src/utils/time.jsx
export function formatTime(d) {
  if (!d) return "未知";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "未知";
  return dt.toLocaleString();
}

export function minutesAgo(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  const diffMs = Date.now() - dt.getTime();
  return Math.floor(diffMs / 60000);
}