// frontend/src/utils/time.jsx
export function formatTime(d) {
  if (!d) return "未知";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "未知";
  return dt.toLocaleString();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatTimeYYYYMMDD_HHMM(d) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  const yyyy = dt.getFullYear();
  const mm = pad2(dt.getMonth() + 1);
  const dd = pad2(dt.getDate());
  const hh = pad2(dt.getHours());
  const mi = pad2(dt.getMinutes());
  const ss = pad2(dt.getSeconds());
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

export function formatTimeYYYYMMDD_HHMMSS(d) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  const yyyy = dt.getFullYear();
  const mm = pad2(dt.getMonth() + 1);
  const dd = pad2(dt.getDate());
  const hh = pad2(dt.getHours());
  const mi = pad2(dt.getMinutes());
  const ss = pad2(dt.getSeconds());
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
}

export function minSecAgo(v) {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  if (!Number.isFinite(t)) return null;

  const diffMs = Date.now() - t;
  if (diffMs < 0) return { min: 0, sec: 0 }; // 時鐘飄移時保底

  const totalSec = Math.floor(diffMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;

  return { min, sec };
}

export function minutesAgo(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  const diffMs = Date.now() - dt.getTime();
  return Math.floor(diffMs / 60000);
}
