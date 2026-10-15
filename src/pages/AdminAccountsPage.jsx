import AccountRoleDropdown from '../components/AccountRoleDropdown';
import { useEffect, useState } from 'react';
import logo from '../assets/logo4.png';
import './AdminAccountsPage.css';
import { adminFetch, useAdminAccess } from '../utils/adminAccess';

export default function AdminAccountsPage({ apiBase }) {
  const { user, canManage } = useAdminAccess();
  const canEditRoles = user?.role === 'admin';
  const roleLabels = { admin: '管理員', staff: '內勤', none: '未授權' };
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!canManage) return;
    const controller = new AbortController();
    async function load() {
      setBusy(true); setError('');
      try {
        const response = await adminFetch(`${apiBase}/api/admin/accounts?${new URLSearchParams({ search: query, page })}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '無法讀取帳號');
        if (!controller.signal.aborted) { setAccounts(result.accounts); setTotal(result.total); }
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }
    load();
    return () => controller.abort();
  }, [apiBase, canManage, query, page, revision]);
  async function changeRole(account, role) {
    if (!canEditRoles || saving) return;
    setSaving(account._id); setError('');
    try {
      const response = await adminFetch(`${apiBase}/api/admin/accounts/${account._id}/role`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '無法更新角色');
      setAccounts(rows => rows.map(row => row._id === account._id ? { ...row, role: result.account.role } : row));
    } catch (err) { setError(err.message); }
    finally { setSaving(''); }
  }
  return <div className="admin-accounts-page">
    <header className="accounts-header"><div className="accounts-topbar">
      <a className="accounts-brand" href="?admin=1"><img src={logo} alt="" /><span><strong>Parking<span>Ji</span></strong><small>停車急管家 · 後台</small></span></a>
      <a className="accounts-back" href="?admin=1">‹ 回到管理選單</a>
    </div></header>
    <main className="admin-accounts">
      <section className="accounts-hero">
        <span className="accounts-kicker">後台管理中心 / ACCOUNTS</span>
        <h1>帳號管理</h1>
        <p>管理團隊成員的後台存取權限。</p>
        <div className="accounts-role-notes"><span>管理員 · 可設定帳號權限</span><span>內勤 · 可查看帳號列表</span></div>
      </section>
      <section className="accounts-panel" aria-labelledby="accounts-list-title">
        <div className="accounts-panel-heading"><div><span className="accounts-badge">Accounts</span><h2 id="accounts-list-title">團隊帳號</h2></div><span className="accounts-total">共 {total} 個帳號</span></div>
        <p className="accounts-hint">新成員請先使用 Google 帳號登入一次，再由管理員授權。未授權帳號僅能瀏覽空白後台。</p>
        {canManage && <p className="accounts-access-note">{canEditRoles ? '你可以調整其他成員的角色；自己的角色需由另一位管理員變更。' : '你目前具有內勤權限，可查看帳號資訊；角色變更請交由管理員處理。'}</p>}
        <form className="accounts-search" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(search.trim()); setRevision(value => value + 1); }}>
          <input aria-label="搜尋帳號" placeholder="搜尋姓名或 Google Email" value={search} onChange={event => setSearch(event.target.value)} />
          <button className="accounts-primary" disabled={!canManage || busy}>搜尋／更新</button>
        </form>
        {error && <div className="accounts-error" role="alert">{error} <button onClick={() => setRevision(value => value + 1)}>重試</button></div>}
        <div className="account-table"><table aria-busy={busy}>
          <thead><tr><th>帳號</th><th>角色與權限</th><th>最近登入（台北時間）</th></tr></thead>
          <tbody>{accounts.map(account => <tr key={account._id}>
            <td><div className="accounts-person"><span className="accounts-avatar" aria-hidden="true">{(account.name || account.email || '?').slice(0, 1).toUpperCase()}</span><div><strong>{account.name || '—'}</strong>{account._id === user?.id && <span className="accounts-self">你</span>}<small>{account.email}</small></div></div></td>
            <td>{canEditRoles ? <AccountRoleDropdown label={`${account.email} 的角色`} value={account.role || 'none'} disabled={!!saving || busy || account._id === user?.id}
              onChange={role => changeRole(account, role)} /> : <span className={`accounts-role accounts-role-${account.role || 'none'}`}>{roleLabels[account.role] || '未授權'}</span>}{saving === account._id && <small role="status">儲存中…</small>}</td>
            <td className="accounts-date">{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '—'}</td>
          </tr>)}{!accounts.length && <tr><td colSpan="3" className="accounts-empty"><span aria-hidden="true">◎</span><strong>{busy ? '載入中…' : canManage ? '沒有符合條件的帳號' : '尚未取得後台權限'}</strong><p>{canManage ? '請確認搜尋條件，或請新成員先完成 Google 登入。' : '登入獲授權的 Google 帳號後，即可查看團隊帳號資訊。'}</p></td></tr>}</tbody>
        </table></div>
        <footer><span>第 {page} 頁</span><div><button disabled={busy || page <= 1} onClick={() => setPage(value => value - 1)}>‹ 上一頁</button><button disabled={busy || page * 50 >= total} onClick={() => setPage(value => value + 1)}>下一頁 ›</button></div></footer>
      </section>
    </main>
  </div>;
}
