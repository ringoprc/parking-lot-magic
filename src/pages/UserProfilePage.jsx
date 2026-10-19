import { useEffect, useRef, useState } from 'react';
import { FiArrowLeft, FiArrowUpRight, FiCamera, FiCheck, FiFlag, FiLock, FiRefreshCw, FiShield, FiUser, FiX } from 'react-icons/fi';
import GoogleAccount from '../components/GoogleAccount';
import { normalizePlate, prepareVehiclePhoto, VEHICLE_PHOTO_SLOTS } from '../utils/vehiclePhoto';
import logo from '../assets/logo4.png';
import './UserProfilePage.css';

async function profileRequest(url, options = {}) {
  let response;
  try { response = await fetch(url, { credentials: 'include', ...options }); }
  catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(error.name === 'TimeoutError' ? '連線逾時，請重新載入確認資料後再試。' : '無法連線，請檢查網路後重試。');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || '無法存取用戶資料，請稍後再試。');
  return result.profile;
}

function PhotoPreview({ url, label }) {
  const [source, setSource] = useState('');
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    async function load() {
      try {
        const response = await fetch(url, { credentials: 'include', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
        if (!response.ok) throw new Error('photo');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl); setError(false);
      } catch { if (!controller.signal.aborted) setError(true); }
    }
    load();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, attempt]);
  if (error) return <div className="vehicle-photo-placeholder"><span>照片載入失敗</span><button type="button" onClick={() => setAttempt(value => value + 1)}>重試</button></div>;
  return source ? <img src={source} alt={`${label}車輛照片`} onError={() => setError(true)} /> : <span role="status">載入照片中…</span>;
}

function VehicleForm({ user, base, beforeLogoutRef }) {
  const [saved, setSaved] = useState(null);
  const [plate, setPlate] = useState('');
  const [editingPlate, setEditingPlate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNote, setReportNote] = useState('');
  const [reportError, setReportError] = useState('');
  const [reporting, setReporting] = useState(false);
  const [photoError, setPhotoError] = useState({});
  const [photoSuccess, setPhotoSuccess] = useState({});
  const [attempt, setAttempt] = useState(0);
  const active = useRef(true);
  const working = useRef(false);
  const endpoint = `${base}/api/profile`;
  const dirty = !!saved && normalizePlate(plate) !== saved.plate;
  const busy = saving || !!preparing || reporting;
  const unsaved = dirty || !!reportNote.trim();
  const plateChanged = !!saved?.plate && normalizePlate(plate) !== saved.plate;
  const photoCount = VEHICLE_PHOTO_SLOTS.filter(({ key }) => saved?.photos[key]).length;
  const photosLocked = !saved?.plate || dirty;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setLoadError('');
      try {
        const profile = await profileRequest(`${endpoint}?${new URLSearchParams({ userId: user.id })}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        });
        if (controller.signal.aborted) return;
        setSaved(profile); setPlate(profile.plate);
        setEditingPlate(false);
        setError(''); setSuccess(profile.plate ? '車牌號碼已送出。' : ''); setPhotoError({}); setPhotoSuccess({});
        setReportOpen(false); setReportNote(''); setReportError('');
      } catch (err) { if (!controller.signal.aborted) setLoadError(err.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [endpoint, user.id, attempt]);

  useEffect(() => {
    if (!unsaved && !busy) return;
    const message = busy ? '照片處理或儲存中，確定要離開？' : '還有未儲存的變更，確定要捨棄並離開？';
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    const beforeLink = event => {
      const link = event.target.closest('a[href]');
      if (!link || link.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
      if (busy || !window.confirm(message)) event.preventDefault();
    };
    const beforeLogout = async () => {
      if (busy) throw new Error('照片處理或儲存中，請稍候再登出。');
      if (!window.confirm(message)) throw new Error('已取消登出，請先儲存資料。');
    };
    beforeLogoutRef.current = beforeLogout;
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', beforeLink, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', beforeLink, true);
      if (beforeLogoutRef.current === beforeLogout) beforeLogoutRef.current = null;
    };
  }, [unsaved, busy, beforeLogoutRef]);

  function updateBody(submittedPlate = saved.plate) {
    const body = new FormData();
    body.set('userId', user.id); body.set('plate', submittedPlate);
    // The profile API requires the stored preference and revision. This form never edits it.
    body.set('shareOnMap', String(saved.shareOnMap)); body.set('revision', String(saved.revision));
    body.set('removePhotos', '[]');
    return body;
  }

  async function updatePhoto(key, file) {
    if (working.current || photosLocked) return;
    working.current = true;
    setPreparing(key);
    setPhotoError(previous => ({ ...previous, [key]: '' }));
    setPhotoSuccess(previous => ({ ...previous, [key]: '' }));
    try {
      const body = updateBody();
      if (file) {
        const photo = await prepareVehiclePhoto(file);
        if (!active.current) return;
        body.set(key, photo);
      } else body.set('removePhotos', JSON.stringify([key]));
      const profile = await profileRequest(endpoint, { method: 'POST', headers: { 'X-Requested-With': 'ParkingJi' }, body, signal: AbortSignal.timeout(60000) });
      if (!active.current) return;
      setSaved(profile);
      setPhotoSuccess(previous => ({ ...previous, [key]: file ? '照片已儲存。' : '照片已移除。' }));
    } catch (err) { if (active.current) setPhotoError(previous => ({ ...previous, [key]: err.message })); }
    finally { working.current = false; if (active.current) setPreparing(''); }
  }

  async function save(event) {
    event.preventDefault();
    if (!saved || working.current || !dirty) return;
    const normalized = normalizePlate(plate);
    if (normalized.length < 2 || normalized.length > 12 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(normalized)) {
      setError('請輸入 2–12 個英文字母、數字或連字號的車牌。'); return;
    }
    working.current = true; setSaving(true); setError(''); setSuccess('');
    const body = updateBody(normalized);
    try {
      const profile = await profileRequest(endpoint, { method: 'POST', headers: { 'X-Requested-With': 'ParkingJi' }, body, signal: AbortSignal.timeout(60000) });
      if (!active.current) return;
      setSaved(profile); setPlate(profile.plate); setEditingPlate(false); setPhotoSuccess({});
      if (profile.plate !== saved.plate || profile.vehicleModel !== saved.vehicleModel) {
        setReportOpen(false); setReportNote(''); setReportError('');
      }
      setSuccess('車牌號碼已送出。');
    } catch (err) { if (active.current) setError(err.name === 'TimeoutError' ? '儲存逾時，請重新載入確認資料後再試。' : err.message); }
    finally { working.current = false; if (active.current) setSaving(false); }
  }

  function reload() {
    if (!unsaved || window.confirm('重新載入會捨棄未儲存的變更與回報草稿，確定繼續？')) setAttempt(value => value + 1);
  }

  async function submitModelReport() {
    if (working.current || dirty || !saved?.vehicleModel || saved.modelReport) return;
    working.current = true; setReporting(true); setReportError(''); setSuccess('');
    try {
      const profile = await profileRequest(`${endpoint}/model-report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ParkingJi' },
        body: JSON.stringify({ userId: user.id, revision: saved.revision, note: reportNote }),
        signal: AbortSignal.timeout(20000),
      });
      if (!active.current) return;
      setSaved(profile); setReportOpen(false); setReportNote('');
      setSuccess('車型回報已送出，待內勤重新確認。');
    } catch (err) { if (active.current) setReportError(err.message); }
    finally { working.current = false; if (active.current) setReporting(false); }
  }

  if (loading) return <section className="profile-card profile-state" role="status"><FiRefreshCw /><h2>正在載入你的資料…</h2></section>;
  if (loadError) return <section className="profile-card profile-state" role="alert"><h2>暫時無法載入</h2><p>{loadError}</p><button type="button" onClick={reload}>重新載入</button></section>;
  return <form onSubmit={save} className="vehicle-form" aria-busy={busy}>
    <fieldset disabled={busy}>
      <section className="profile-card" aria-labelledby="vehicle-details-title">
        <div className="profile-section-heading"><div><span className="profile-step">01 / MY VEHICLE</span><h2 id="vehicle-details-title">我的車輛</h2></div><span className={`profile-badge${saved.vehicleModel && !plateChanged && !saved.modelReport ? ' is-confirmed' : ''}`}>{plateChanged ? '車型待重新確認' : saved.modelReport ? '車型回報待確認' : saved.vehicleModel ? '車型已設定' : saved.plate ? '待確認車型' : '尚未建立車輛資料'}</span></div>
        <div className="vehicle-details-grid">
          <div className="profile-field"><label htmlFor="vehicle-plate">車牌號碼 <span>必填</span></label><input id="vehicle-plate" name="plate" type="text" required maxLength={20} placeholder="例如 ABC-1234" autoComplete="off" autoCapitalize="characters" spellCheck={false} className={saved.plate && !dirty && !editingPlate ? 'is-submitted' : undefined}
            onFocus={() => setEditingPlate(true)} value={plate} onChange={event => { setPlate(event.target.value); setSuccess(''); }} onBlur={() => { setPlate(normalizePlate(plate)); setEditingPlate(false); }} />
            {success && <p className="profile-success" role="status"><FiCheck />{success}</p>}
          </div>
          <div className="profile-field"><label htmlFor="vehicle-model">車子型號 <span><FiLock /> 由我們設定</span></label><input id="vehicle-model" value={plateChanged ? '' : saved.vehicleModel} placeholder="等待內勤確認" readOnly aria-describedby="model-hint" /><p id="model-hint">我們會依車牌查詢並設定你的車子型號。</p>
            <div className="vehicle-plate-submit"><button type="submit" className="profile-primary" disabled={busy || !dirty}><FiCheck />{saving ? '送出中…' : '送出車牌號碼'}</button></div>
            {error && <div className="profile-error" role="alert">{error}<button type="button" className="profile-inline-reload" onClick={reload}>重新載入</button></div>}
            {saved.vehicleModel && !plateChanged && !saved.modelReport && <button type="button" className="vehicle-model-report-link" aria-expanded={reportOpen} aria-controls="vehicle-model-report" onClick={() => { setReportOpen(value => !value); setReportError(''); }}><FiFlag />{reportOpen ? '收合回報' : '回報車型有誤'}</button>}
          </div>
        </div>
        {saved.modelReport && !plateChanged && <div className="vehicle-model-report-status" role="status"><FiFlag /><div><strong>已回報車型有誤，待內勤重新確認</strong><p>回報車牌：{saved.modelReport.plate} · 車型：{saved.modelReport.vehicleModel}</p>{saved.modelReport.note && <p className="vehicle-report-note">你的說明：{saved.modelReport.note}</p>}<small>回報時間：{new Date(saved.modelReport.reportedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</small></div></div>}
        {reportOpen && saved.vehicleModel && !plateChanged && !saved.modelReport && <div id="vehicle-model-report" className="vehicle-model-report-editor" role="group" aria-labelledby="model-report-title">
          <h3 id="model-report-title">回報車型有誤</h3><p>回報車牌 <strong>{saved.plate}</strong> 的車型「{saved.vehicleModel}」。送出後由內勤重新確認，你的車型不會立即變更。</p>
          <label htmlFor="model-report-note">補充說明 <span>選填</span></label><textarea id="model-report-note" maxLength={500} rows={3} placeholder="例如：我的車是 Toyota Yaris，不是 Corolla。也可以補充年份或其他資訊。" value={reportNote} onChange={event => { setReportNote(event.target.value); setReportError(''); }} />
          <div className="vehicle-model-report-actions"><small>{reportNote.length} / 500 字</small><button type="button" className="profile-secondary" onClick={() => { setReportOpen(false); setReportNote(''); setReportError(''); }}>取消</button><button type="button" className="profile-primary" disabled={dirty} onClick={submitModelReport}>{reporting ? '送出中…' : '送出回報'}</button></div>
          {dirty && <p className="profile-notice">請先送出目前的車牌號碼，再送出回報。</p>}
          {reportError && <p className="profile-error" role="alert">{reportError}</p>}
        </div>}
        {plateChanged && <p className="profile-notice">更換車牌後，車型需重新確認。請一併確認下方照片是否為這輛車。</p>}

      <div className="vehicle-ownership-photos" role="group" aria-labelledby="vehicle-photos-title">
        <div className="profile-section-heading"><div><h3 id="vehicle-photos-title">這輛車的照片 <span className="profile-optional">選填</span></h3><span className="vehicle-photo-plate">{saved.plate ? `對應車牌：${saved.plate}` : '請先送出車牌號碼'}</span></div><span className="profile-photo-count">{photoCount} <span>/ 4 張</span></span></div>
        <p className="vehicle-ownership-purpose"><FiShield /><span>為什麼需要照片？<strong>協助確認這個車牌的車輛確實屬於你。</strong>照片僅供我們確認，不會公開給其他用戶。照片提供不完整時，我們可能無法確認並登錄你的車輛型號。</span></p>
        <p className="profile-description">請拍攝你的車輛左前、右前、左後、右後四個角度，讓車牌號碼與車身清楚入鏡。照片為選填，請先送出車牌號碼，之後可隨時補上。選取或移除照片後會立即儲存。</p>
        {photosLocked && <p className="profile-notice vehicle-photo-notice">請先送出車牌號碼，再上傳或移除照片。</p>}
        <div className="vehicle-photo-grid">
          {VEHICLE_PHOTO_SLOTS.map(({ key, label, hint }, index) => {
            const hasPhoto = !!saved.photos[key];
            const url = `${endpoint}/photos/${key}?${new URLSearchParams({ userId: user.id, v: saved.photos[key] || '' })}`;
            return <div key={key} className={`vehicle-photo-card${hasPhoto ? ' has-photo' : ''}`}>
              <div className="vehicle-photo-heading"><strong><span>0{index + 1}</span>{label}</strong>{hasPhoto && <span className="vehicle-photo-state"><FiCheck /> 已上傳</span>}</div>
              <div className="vehicle-photo-preview">
                {hasPhoto ? <PhotoPreview key={`${key}-${saved.photos[key]}`} url={url} label={label} /> : <div className="vehicle-photo-placeholder"><FiCamera size={27} /><span>{hint}</span><small>約 45° 拍攝，車牌需清楚入鏡</small></div>}
              </div>
              <div className="vehicle-photo-actions"><label className="vehicle-photo-upload"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={photosLocked} aria-label={`${hasPhoto ? '更換' : '上傳'}${label}照片`} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) updatePhoto(key, file); }} /><FiCamera />{preparing === key ? '儲存中…' : hasPhoto ? '更換照片' : '選擇照片'}</label>{hasPhoto && <button type="button" aria-label={`移除${label}照片`} disabled={photosLocked} onClick={() => updatePhoto(key, null)}><FiX />移除</button>}</div>
              {preparing === key && <p className="vehicle-photo-status" role="status">正在儲存照片…</p>}
              {photoSuccess[key] && <p className="vehicle-photo-status" role="status">{photoSuccess[key]}</p>}
              {photoError[key] && <p className="vehicle-photo-error" role="alert">{photoError[key]}<button type="button" className="profile-inline-reload" onClick={reload}>重新載入</button></p>}
            </div>;
          })}
        </div>
        <p className="profile-photo-hint"><FiLock /> 支援 JPG、PNG、WebP，每張上限 10 MB。</p>
      </div>
      </section>

    </fieldset>
  </form>;
}

export default function UserProfilePage({ apiBase }) {
  const [user, setUser] = useState(null);
  const [authBusy, setAuthBusy] = useState(true);
  const beforeLogoutRef = useRef(null);
  const base = import.meta.env.DEV ? apiBase.replace(/\/$/, '') : '';
  return <div className="user-profile-page">
    <header className="profile-header"><div className="profile-topbar"><a className="profile-brand" href="/"><img src={logo} alt="" /><span>Parking<b>Ji</b><small>停車急管家</small></span></a><div className="profile-header-actions"><a className="profile-back" href="/"><FiArrowLeft />回到地圖</a><GoogleAccount apiBase={apiBase} onUserChange={setUser} onBusyChange={setAuthBusy} beforeLogoutRef={beforeLogoutRef} /></div></div></header>
    <main className="profile-shell">
      <div className="profile-intro"><span className="profile-step">ACCOUNT / 帳號資料管理</span><h1>用戶資料</h1></div>
      <div className="profile-layout">
        <aside className="profile-sidebar"><section className="profile-identity"><span className="profile-avatar" aria-hidden="true">{user ? (user.name || user.email).slice(0, 1).toUpperCase() : <FiUser />}</span><h2>{user?.name || '我的帳號'}</h2><p>{user?.email || '使用 Google 帳號管理個人資料'}</p><span className="profile-identity-label"><FiShield />{user ? '已連結 Google 帳號' : '登入後即可開始'}</span></section><section className="profile-privacy"><FiLock /><h2>由你掌握分享範圍</h2><p>車牌與照片用於協助確認車輛屬於你，不會顯示給其他用戶。地圖分享預設關閉。</p><a href="/privacy.html" target="_blank" rel="noreferrer">隱私權政策 <FiArrowUpRight /></a></section></aside>
        {user ? <VehicleForm key={user.id} user={user} base={base} beforeLogoutRef={beforeLogoutRef} /> : <section className="profile-card profile-state" role="status"><FiUser /><h2>{authBusy ? '正在確認登入狀態…' : '登入，建立你的車輛資料'}</h2><p>{authBusy ? '請稍候。' : '請點選右上角「登入」，即可填寫車牌及選填車輛照片。'}</p></section>}
      </div>
    </main>
  </div>;
}
