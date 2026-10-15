import { useCallback, useEffect, useState } from 'react';
import GoogleAccount from './GoogleAccount';
import { AdminAccessContext } from '../utils/adminAccess';
import './AdminAccess.css';

export default function AdminAccess({ apiBase, children }) {
  const [user, setUser] = useState(null);
  const [accountVersion, setAccountVersion] = useState(0);
  const [sessionError, setSessionError] = useState('');
  const base = import.meta.env.DEV ? apiBase.replace(/\/$/, '') : '';
  const canManage = ['admin', 'staff'].includes(user?.role);
  const onUserChange = useCallback(value => { setUser(value); setSessionError(''); }, []);
  useEffect(() => {
    let active = true;
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(`${base}/api/auth/session`, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('無法確認登入狀態，請稍後重試。');
        const result = await response.json();
        if (active) { setUser(result.user); setSessionError(''); }
      } catch {
        if (active) { setUser(null); setSessionError('無法確認登入狀態，請稍後重試。'); }
      } finally { pending = false; }
    }
    function invalidate() {
      setUser(null);
      setAccountVersion(value => value + 1);
    }
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('admin-access-invalid', invalidate);
    localStorage.removeItem('adminKey');
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('admin-access-invalid', invalidate); };
  }, [base]);
  return <AdminAccessContext.Provider value={{ user, canManage }}>
    <div className="admin-account-bar">
      <span>{sessionError || (canManage ? `${user.role === 'admin' ? '管理員' : '內勤'} · ${user.email}` : user ? '此帳號尚未取得後台權限；目前僅顯示頁面架構。' : '登入獲授權的 Google 帳號後即可查看後台資料。')}</span>
      <GoogleAccount key={accountVersion} apiBase={apiBase} onUserChange={onUserChange} />
    </div>
    <div className="admin-page-content" key={`${user?.id || 'guest'}:${user?.role || 'none'}`}>{children}</div>
  </AdminAccessContext.Provider>;
}
