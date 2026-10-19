export const WAITING_FOR_MAP_LOCATION = '正在等待開啟定位，成功定位後分享位置與車型';

const retryable = error => !error.status || error.status === 408 || error.status === 429 || error.status >= 500;

export function pruneSharedLocations(rows, now = Date.now()) {
  const valid = rows.filter(row => Date.parse(row.expiresAt) > now);
  return valid.length === rows.length ? rows : valid;
}

export function applyNearbyResult(rows, result, now = Date.now()) {
  // A successful empty response is authoritative (including revoked sharing).
  if (!result.error) return pruneSharedLocations(result.locations, now);
  if ([401, 403, 409].includes(result.error.status)) return [];
  // Temporary read failures must not erase still-valid positions or extend expiry.
  return pruneSharedLocations(rows, now);
}

export function createLocationPublisher({ request, geolocation, onState, timers = globalThis }) {
  let run = null;
  const remove = lease => request('stop', { lease }, { keepalive: true }).catch(() => {});
  function stop() {
    const previous = run;
    run = null;
    if (!previous) return;
    timers.clearTimeout(previous.timer);
    if (previous.lease) void remove(previous.lease);
  }
  async function start(revision, hasMapLocation = false) {
    stop();
    if (!hasMapLocation) { onState({ text: WAITING_FOR_MAP_LOCATION }); return; }
    if (!geolocation) { onState({ error: true, text: '此瀏覽器無法定位，請使用支援定位的瀏覽器。' }); return; }
    const current = { sequence: 0, lease: null, timer: null, failures: 0 };
    run = current;
    onState({ text: '正在取得位置…' });
    function retry(action, text) {
      if (run !== current) return;
      onState({ error: true, text });
      current.timer = timers.setTimeout(action, Math.min(5000 * 2 ** current.failures++, 30000));
    }
    function failed(error, action) {
      if (run !== current) return;
      if (retryable(error)) retry(action, '位置更新暫時中斷，正在重試…');
      else { stop(); onState({ error: true, text: error.message }); }
    }
    const publish = () => {
      if (run !== current) return;
      geolocation.getCurrentPosition(async position => {
        if (run !== current) return;
        try {
          await request('update', { lease: current.lease, sequence: ++current.sequence,
            lat: position.coords.latitude, lng: position.coords.longitude, measuredAt: position.timestamp });
          if (run !== current) return;
          current.failures = 0;
          onState({ sharing: true, text: '正在分享位置與車型' });
          current.timer = timers.setTimeout(publish, 10_000);
        } catch (error) {
          if (run !== current) return;
          if (error.code === 'LEASE_EXPIRED') {
            // The server rechecks the original consent revision before a new lease.
            current.lease = null;
            retry(connect, '正在重新連線並取得位置…');
          } else failed(error, publish);
        }
      }, error => {
        if (run !== current) return;
        if (error.code === 1) {
          stop(); onState({ error: true, text: '定位權限未開啟，目前未分享位置。請允許定位後按定位按鈕重試。' });
        } else retry(publish, '暫時無法取得新位置，正在重試定位…');
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 });
    };
    async function connect() {
      if (run !== current) return;
      try {
        const data = await request('start', { revision });
        if (run !== current) { void remove(data.lease); return; }
        current.lease = data.lease;
        current.sequence = 0;
        publish();
      } catch (error) { failed(error, connect); }
    }
    await connect();
  }
  return { start, stop };
}

export async function locationRequest(base, userId, action, body, options = {}) {
  const response = await fetch(`${base}/api/profile/locations/${action}`, {
    method: 'POST', credentials: 'include', signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ParkingJi' },
    body: JSON.stringify({ userId, ...body }), ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || '位置分享暫時無法連線，請稍後重試。'), { status: response.status, code: data.code });
  return data;
}
