import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import './AiCoverageCard.css';

const HOUR = 3600000;
const formatTime = (value) => new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value));

export default function AiCoverageCard({ apiBase = '' }) {
  const [key, setKey] = useState(() => localStorage.getItem('adminKey') || '');
  const [credential, setCredential] = useState(key);
  const [days, setDays] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const isMobile = useMediaQuery('(max-width: 900px)');
  const chartRef = useRef(null);
  const [mobileChartWidth, setMobileChartWidth] = useState(320);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`${apiBase}/api/admin/ai-coverage?days=30`, {
          headers: { 'x-admin-key': key }, signal: controller.signal,
        });
        if (!response.ok) throw new Error(response.status === 401 ? '管理金鑰不正確' : '暫時無法讀取統計');
        const result = await response.json();
        if (!controller.signal.aborted) { setData(result); setError(''); }
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    const timer = setInterval(load, HOUR);
    return () => { controller.abort(); clearInterval(timer); };
  }, [apiBase, key, retry]);

  const end = data ? new Date(data.to).getTime() : 0;
  const start = end - (days * 24 - 1) * HOUR;
  const rows = (data?.rows || []).filter(row => new Date(row._id).getTime() >= start);
  const latest = rows.at(-1);
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (!isMobile || !hasRows || !chartRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setMobileChartWidth(entry.contentRect.width);
    });
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [isMobile, hasRows]);

  // Match mobile SVG units to CSS pixels so labels don't shrink with the chart.
  const chartWidth = isMobile ? mobileChartWidth : 780;
  const plotLeft = isMobile ? 44 : 40;
  const plotRight = chartWidth - (isMobile ? 12 : 40);
  const max = Math.max(1, ...rows.map(row => row.count));
  const x = (row) => plotLeft + (new Date(row._id).getTime() - start) / (end - start) * (plotRight - plotLeft);
  const y = (row) => 160 - row.count / max * 130;
  const stale = data && (!latest || end - new Date(latest._id).getTime() >= 2 * HOUR);
  const segments = [];
  rows.forEach((row, index) => {
    if (!index || new Date(row._id) - new Date(rows[index - 1]._id) > HOUR) segments.push([]);
    segments.at(-1).push(`${x(row)},${y(row)}`);
  });

  return <section className="ai-coverage-card" aria-labelledby="ai-coverage-title">
    <div className="admin-menu-card-head ai-coverage-topbar">
      <span className="admin-menu-card-badge">AI Coverage</span>
      {latest && <p className="ai-coverage-caption ai-coverage-latest">最近記錄：{formatTime(latest.sampledAt)}（台北時間）</p>}
    </div>
    <div className="ai-coverage-heading">
      <div><h2 id="ai-coverage-title">有辨識結果的停車場</h2></div>
      <div className="ai-coverage-ranges" aria-label="統計期間">
        {[1, 7, 30].map(value => <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>{value} 天</button>)}
      </div>
    </div>
    {(!key || error) && <form className="ai-coverage-auth" onSubmit={event => {
      event.preventDefault(); localStorage.setItem('adminKey', credential); setData(null); setKey(credential); setRetry(value => value + 1);
    }}>
      <label>管理金鑰 <input type="password" value={credential} onChange={event => setCredential(event.target.value)} autoComplete="off" required /></label>
      <button type="submit">查看統計</button>
    </form>}
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">讀取統計中…</p>}
    {data && <>
      <div className="ai-coverage-summary"><strong>{latest ? latest.count.toLocaleString('zh-TW') : '—'}</strong><span>個停車場{latest && ` / ${latest.totalActive.toLocaleString('zh-TW')} 個啟用中`}</span></div>
      {!latest && <p className="ai-coverage-caption">此期間尚無記錄，資料會從啟用收集後開始累積。</p>}
      {stale && <p role="status">最近尚無新記錄，請確認每小時收集工作是否正常執行。</p>}
      {!!rows.length && <>
        <svg ref={chartRef} className="ai-coverage-chart" viewBox={`0 0 ${chartWidth} 200`} role="img" aria-label={`最近 ${days} 天，每小時有辨識結果的停車場數量；缺少的時段保留空白`}>
          {[0, 0.5, 1].map(fraction => <g key={fraction}><line x1={plotLeft} x2={plotRight} y1={160 - fraction * 130} y2={160 - fraction * 130} stroke="#e1e9e3" /><text x={plotLeft - 10} y={164 - fraction * 130} textAnchor="end">{Math.round(max * fraction)}</text></g>)}
          {segments.map((points, index) => <polyline key={index} points={points.join(' ')} fill="none" stroke="#31815d" strokeWidth="2.5" />)}
          {rows.map(row => <circle key={row._id} cx={x(row)} cy={y(row)} r={days === 30 ? 2 : 3} fill="#31815d"><title>{formatTime(row.sampledAt)}：{row.count} 個</title></circle>)}
          <text x={plotLeft} y="190">{formatTime(start)}</text><text x={plotRight} y="190" textAnchor="end">{formatTime(end)}</text>
        </svg>
        <details><summary>查看每小時記錄（{rows.length} 筆）</summary><div className="ai-coverage-table"><table><thead><tr><th>記錄時間（台北）</th><th>有結果</th><th>啟用中</th></tr></thead><tbody>{[...rows].reverse().map(row => <tr key={row._id}><td>{formatTime(row.sampledAt)}</td><td>{row.count}</td><td>{row.totalActive}</td></tr>)}</tbody></table></div></details>
      </>}
    </>}
    <p className="ai-coverage-caption">依地圖「有辨識結果」口徑，包含空位數及「有／無」結果。未收集的時段留白，不以 0 補齊。</p>
  </section>;
}
