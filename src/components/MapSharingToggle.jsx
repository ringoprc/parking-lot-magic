import { useEffect, useRef, useState } from 'react';
import { createLocationPublisher, locationRequest } from '../utils/locationSharing';

export default function MapSharingToggle({ user, apiBase, locateRequest = 0 }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(!!user?.id);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = useRef(true);
  const working = useRef(false);
  const publisher = useRef(null);
  // Do not consume a completed location request until the sharing preference is ready.
  const lastLocate = useRef(null);
  const hasLocated = useRef(false);
  const [live, setLive] = useState(null);
  const base = import.meta.env.DEV ? apiBase.replace(/\/$/, '') : '';
  const endpoint = `${base}/api/profile`;

  useEffect(() => {
    if (!user?.id) return;
    const instance = createLocationPublisher({
      request: (action, body, options) => locationRequest(base, user.id, action, body, options),
      geolocation: navigator.geolocation,
      onState: state => {
        if (state.sharing) hasLocated.current = true;
        setLive(state);
      },
    });
    publisher.current = instance;
    const pause = () => {
      instance.stop();
      lastLocate.current = null;
      setLive({ text: '分享已暫停 · 離開網頁時停止分享' });
    };
    const onVisibility = () => { if (document.visibilityState !== 'visible') pause(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', pause);
    return () => {
      instance.stop(); publisher.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', pause);
    };
  }, [base, user?.id]);

  useEffect(() => {
    if (!profile || loading || saving || error || document.visibilityState !== 'visible') return;
    if (locateRequest === 0 && !hasLocated.current) return;
    if (lastLocate.current === locateRequest) return;
    lastLocate.current = locateRequest;
    if (profile.shareOnMap) void publisher.current?.start(profile.revision);
  }, [locateRequest, profile, loading, saving, error]);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const controller = new AbortController();
    let loadVersion = 0;
    async function load() {
      if (working.current) return;
      const version = ++loadVersion;
      setLoading(true);
      try {
        const response = await fetch(`${endpoint}?${new URLSearchParams({ userId: user.id })}`, {
          credentials: 'include', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '無法讀取分享偏好。');
        if (!controller.signal.aborted && version === loadVersion) { setProfile(data.profile); setError(false); setMessage(''); }
      } catch (err) {
        if (!controller.signal.aborted && version === loadVersion) { setError(true); setMessage(err.name === 'TypeError' ? '無法連線，請稍後重試。' : err.name === 'TimeoutError' ? '讀取逾時，請重新載入。' : err.message); }
      } finally { if (!controller.signal.aborted && version === loadVersion) setLoading(false); }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    load();
    document.addEventListener('visibilitychange', onVisible);
    return () => { controller.abort(); document.removeEventListener('visibilitychange', onVisible); };
  }, [endpoint, user?.id, attempt]);

  async function toggle() {
    if (!user?.id) { setMessage('請先登入，再設定位置分享偏好。'); return; }
    if (working.current || loading || !profile || error) return;
    publisher.current?.stop(); setLive(null);
    working.current = true; setSaving(true); setMessage('');
    try {
      const response = await fetch(`${endpoint}/sharing-preference`, {
        method: 'POST', credentials: 'include', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ParkingJi' },
        body: JSON.stringify({ userId: user.id, revision: profile.revision, shareOnMap: !profile.shareOnMap }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '無法儲存分享偏好，請重試。');
      if (!active.current) return;
      setProfile(data.profile);
      if (data.profile.shareOnMap && document.visibilityState === 'visible') {
        lastLocate.current = locateRequest;
        void publisher.current?.start(data.profile.revision);
      }
    } catch (err) {
      if (active.current) { setError(true); setMessage(err.name === 'TimeoutError' ? '儲存逾時，請重新載入確認偏好。' : err.name === 'TypeError' ? '無法連線，請重新載入後重試。' : err.message); }
    } finally { working.current = false; if (active.current) setSaving(false); }
  }

  return <div className="map-sharing-control map-sharing-control-own">
    <div className="map-sharing-feedback">
      {message && <div className={`map-sharing-message${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>
        <span>{message}</span>
        {!user?.id && <a href="?profile=1">登入／管理資料</a>}
        {error && <button type="button" disabled={loading || saving} onClick={() => setAttempt(value => value + 1)}>重新載入</button>}
      </div>}
      <span className="map-sharing-hint" id="map-sharing-hint" role={live?.error ? 'alert' : 'status'}>{loading ? '讀取偏好中…' : saving ? '儲存中…' : !profile?.shareOnMap ? '開啟時，僅分享位置與車型' : live?.sharing ? '正在分享位置與車型 · 離開網頁時停止分享' : live?.text || (locateRequest > 0 ? '正在準備分享 · 離開網頁時停止分享' : '按定位開始分享 · 離開網頁時停止分享')}</span>
    </div>
    <button type="button" className={`map-number-filter map-sharing-toggle${profile?.shareOnMap ? ' is-active' : ''}`}
      role="switch" aria-checked={profile?.shareOnMap === true} aria-label="顯示我的位置給其他用戶"
      aria-describedby="map-sharing-hint" aria-busy={loading || saving}
      disabled={loading || saving || (!!user?.id && (error || !profile))} onClick={toggle}>
      <span className="map-number-filter-dot" aria-hidden="true" />
      <span className="map-number-filter-label">顯示我的位置給其他用戶</span>
      <span className="map-sharing-switch" aria-hidden="true" />
    </button>
  </div>;
}
