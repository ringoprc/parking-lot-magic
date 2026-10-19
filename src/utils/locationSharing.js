export const WAITING_FOR_MAP_LOCATION = '正在等待開啟定位，成功定位後分享位置與車型';

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
    const current = { sequence: 0, lease: null, timer: null };
    run = current;
    onState({ text: '正在取得位置…' });
    try {
      const data = await request('start', { revision });
      if (run !== current) { void remove(data.lease); return; }
      current.lease = data.lease;
      const publish = () => {
        if (run !== current) return;
        geolocation.getCurrentPosition(async position => {
          if (run !== current) return;
          try {
            await request('update', { lease: current.lease, sequence: ++current.sequence,
              lat: position.coords.latitude, lng: position.coords.longitude, measuredAt: position.timestamp });
            if (run !== current) return;
            onState({ sharing: true, text: '正在分享位置與車型' });
            current.timer = timers.setTimeout(publish, 10_000);
          } catch (error) {
            if (run !== current) return;
            stop(); onState({ error: true, text: error.message });
          }
        }, error => {
          if (run !== current) return;
          stop();
          onState({ error: true, text: error.code === 1
            ? '定位權限未開啟，目前未分享位置。請允許定位後按定位按鈕重試。'
            : '暫時無法定位，已停止分享。請按定位按鈕重試。' });
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 });
      };
      publish();
    } catch (error) {
      if (run !== current) return;
      stop(); onState({ error: true, text: error.message });
    }
  }
  return { start, stop };
}

export async function locationRequest(base, userId, action, body, options = {}) {
  const response = await fetch(`${base}/api/profile/locations/${action}`, {
    method: 'POST', credentials: 'include', signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ParkingJi' },
    body: JSON.stringify({ userId, ...body }), ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '位置分享暫時無法連線，請稍後重試。');
  return data;
}
