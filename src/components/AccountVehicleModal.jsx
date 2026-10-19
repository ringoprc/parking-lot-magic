import { useEffect, useRef, useState } from 'react';
import { VEHICLE_PHOTO_SLOTS } from '../utils/vehiclePhoto';
import { adminFetch } from '../utils/adminAccess';

function VehicleReviewPhoto({ url, label }) {
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    async function load() {
      try {
        const response = await adminFetch(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
        if (!response.ok) throw new Error(response.status === 409 ? '照片已更新，請重新載入視窗。' : '照片載入失敗，請重新載入視窗。');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
    }
    load();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);
  return <figure className={expanded ? 'is-expanded' : undefined}><figcaption>{label}</figcaption>
    {error ? <p role="alert">{error}</p> : source ? <button type="button" className="account-vehicle-photo-button" aria-label={`${expanded ? '縮小' : '放大'}${label}照片`} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      <img src={source} alt={`${label}車輛照片`} onError={() => setError('照片無法顯示，請重新載入視窗。')} /><span>{expanded ? '縮小照片' : '放大照片'}</span>
    </button> : <p role="status">載入照片中…</p>}
  </figure>;
}

export default function AccountVehicleModal({ account, apiBase, onClose, onSaved }) {
  const dialogRef = useRef(null);
  const savingRef = useRef(false);
  const [vehicle, setVehicle] = useState(null);
  const [model, setModel] = useState('');
  const [vehicleType, setVehicleType] = useState('passenger');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dirty = !!vehicle && (model.trim() !== vehicle.vehicleModel || vehicleType !== vehicle.vehicleType);
  const endpoint = `${apiBase}/api/admin/accounts/${account._id}/vehicle`;

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); trigger?.focus(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setVehicle(null); setError(''); setConflict(false);
      try {
        const response = await adminFetch(endpoint, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '無法讀取車輛資料。');
        if (!controller.signal.aborted) { setVehicle(result.vehicle); setModel(result.vehicle?.vehicleModel || ''); setVehicleType(result.vehicle?.vehicleType || 'passenger'); }
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [endpoint, attempt]);

  useEffect(() => {
    if (!dirty && !saving) return;
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, saving]);

  function close() {
    if (savingRef.current) return;
    if (!dirty || window.confirm('車型尚未儲存，確定捨棄修改？')) onClose();
  }
  function reload() {
    if (!dirty || window.confirm('重新載入會捨棄目前修改，確定繼續？')) setAttempt(value => value + 1);
  }
  async function save(event) {
    event.preventDefault();
    if (savingRef.current || !vehicle || !model.trim() || conflict) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const response = await adminFetch(endpoint, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ plate: vehicle.plate, vehicleModel: model.trim(), vehicleType, revision: vehicle.revision }),
      });
      const result = await response.json();
      if (!response.ok) { if (response.status === 409) setConflict(true); throw new Error(result.error || '無法儲存車型。'); }
      onSaved(result.vehicle);
    } catch (err) {
      // A timed-out request may already have saved. Require a fresh read before retrying.
      if (err.name === 'TimeoutError' || err instanceof TypeError) setConflict(true);
      setError(err.name === 'TimeoutError' ? '儲存逾時，請重新載入確認結果。' : err.message);
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <dialog ref={dialogRef} className="account-vehicle-modal" aria-labelledby="account-vehicle-title"
    onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="account-vehicle-content">
      <header><div><span className="accounts-kicker">VEHICLE SETTINGS</span><h2 id="account-vehicle-title">編輯車輛資料</h2></div><button type="button" aria-label="關閉編輯視窗" disabled={saving} onClick={close}>×</button></header>
      <p className="account-vehicle-owner"><strong>{account.name || '未提供姓名'}</strong><span>{account.email}</span></p>
      {loading ? <p role="status">正在載入車輛資料…</p> : <>
        {error && <div className="accounts-error" role="alert">{error} <button type="button" disabled={saving} onClick={reload}>重新載入</button></div>}
        {vehicle ? <form onSubmit={save} aria-busy={saving}>
          <label htmlFor="admin-vehicle-plate">已送出的車牌號碼</label>
          <input id="admin-vehicle-plate" value={vehicle.plate} readOnly />
          {vehicle.modelReport && <div className="account-vehicle-report"><strong>用戶回報車型有誤</strong><p>原車型：{vehicle.modelReport.vehicleModel}</p><p>{vehicle.modelReport.note || '未補充說明'}</p></div>}
          <section className="account-vehicle-photos" aria-labelledby="admin-vehicle-photos-title">
            <div className="account-vehicle-photos-heading"><h3 id="admin-vehicle-photos-title">車輛照片</h3><button type="button" disabled={saving} onClick={reload}>重新載入</button></div>
            <p className="account-vehicle-help">確認照片中的車牌與車輛是否一致。點擊照片可放大查看。</p>
            <div className="account-vehicle-photo-grid">{VEHICLE_PHOTO_SLOTS.map(({ key, label }) => vehicle.photos?.[key]
              ? <VehicleReviewPhoto key={`${key}-${vehicle.revision}`} label={label} url={`${endpoint}/photos/${key}?${new URLSearchParams({ revision: String(vehicle.revision) })}`} />
              : <figure key={key}><figcaption>{label}</figcaption><p className="account-vehicle-photo-missing">未上傳照片</p></figure>)}</div>
          </section>
          <label htmlFor="admin-vehicle-model">車子型號</label>
          <input id="admin-vehicle-model" value={model} required maxLength={120} disabled={saving || conflict} placeholder="例如 Toyota Corolla Cross" onChange={event => setModel(event.target.value)} />
          <label htmlFor="admin-vehicle-type">車輛類型</label>
          <select id="admin-vehicle-type" value={vehicleType} disabled={saving || conflict} onChange={event => setVehicleType(event.target.value)}>
            <option value="passenger">一般小客車（藍色圖示）</option><option value="sports">跑車（紅色圖示）</option>
          </select>
          <p className="account-vehicle-help">請完成車輛確認後再儲存。車型將顯示於用戶資料，以及用戶開啟的位置分享中。{vehicle.modelReport && '儲存後會將這次車型回報標記為已處理。'}</p>
          <footer><button type="button" disabled={saving} onClick={close}>取消</button><button className="accounts-primary" disabled={saving || conflict || !model.trim() || (!dirty && !vehicle.modelReport)}>{saving ? '儲存中…' : '儲存並確認車型'}</button></footer>
        </form> : !error && <><p>用戶尚未送出車牌，待用戶提交後即可設定車型。</p><footer><button type="button" onClick={close}>關閉</button></footer></>}
      </>}
    </div>
  </dialog>;
}
