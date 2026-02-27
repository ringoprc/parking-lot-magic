// frontend/src/pages/AdminDevicesPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import "./AdminDevicesPage.css";
import { Spinner } from "reactstrap";

import { 
  formatTime, 
  formatTimeYYYYMMDD_HHMMSS, 
  minutesAgo, 
  minSecAgo 
} from "../utils/time";

import { FaCheck } from "react-icons/fa6";
import { 
  PiBatteryVerticalFull,
  PiBatteryVerticalHigh,
  PiBatteryVerticalMedium,
  PiBatteryVerticalLow
} from "react-icons/pi";

const PAGE_SIZE = 16;

//-----------------------
// Helpers
//-----------------------

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function batteryLevel(pct) {
  if (pct == null) return null;
  const p = Number(pct);
  if (!Number.isFinite(p)) return null;
  const v = Math.max(0, Math.min(100, Math.round(p)));
  return v;
}

function batteryColor(pct) {
  const p = batteryLevel(pct);
  if (p == null) return "#bbb";
  if (p >= 75) return "#4caf50"; // green
  if (p >= 20) return "#e67e22"; // orange
  return "#de1802";              // red
}

function BatteryIcon({ pct, size = 16 }) {
  const p = batteryLevel(pct);
  if (p == null) return null;

  if (p >= 75) return <PiBatteryVerticalFull size={size} />;
  if (p >= 50) return <PiBatteryVerticalHigh size={size} />;
  if (p >= 25) return <PiBatteryVerticalMedium size={size} />;
  return <PiBatteryVerticalLow size={size} />;
}


//-----------------------
// Component
//-----------------------

export default function AdminDevicesPage({ apiBase }) {

  //-----------------------------
  // States
  //-----------------------------
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem("adminKey") || "");
  const [isAdminConfirmed, setIsAdminConfirmed] = useState(false);

  // ParkingLotGroup: [{ _id, name, lotIds, ... }]
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState("all");
  const [search, setSearch] = useState("");

  // search box text vs applied search (so typing won’t change the auto-refresh query)
  const [appliedSearch, setAppliedSearch] = useState("");

  // last fetch info
  const [lastFetchAt, setLastFetchAt] = useState(null); // number (ms)
  const [lastFetchError, setLastFetchError] = useState("");

  // prevent overlapping fetches (interval + manual actions)
  const inFlightRef = useRef(false);

  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: PAGE_SIZE });
  const [loading, setLoading] = useState(false);

  // deviceId -> edited vacancy
  const [editMap, setEditMap] = useState({});
  const [confirmAllLoading, setConfirmAllLoading] = useState(false);

  //-----------------------------
  // Admin Key
  //-----------------------------
  function persistAdminKey(v) {
    setAdminKey(v);
    localStorage.setItem("adminKey", v);
  }


  //-----------------------------
  // Fetch Lot Groups
  //-----------------------------
  async function fetchGroups() {
    if (!adminKey) return;
    const res = await fetch(`${apiBase}/api/admin/parking-lot-groups`, {
      headers: { "x-admin-key": adminKey },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "load groups failed");
    setGroups(Array.isArray(data?.rows) ? data.rows : []);
  }

  // fetch groups after adminKey is available (and whenever adminKey changes)
  useEffect(() => {
    if (!adminKey) return;
    fetchGroups().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);


  //-----------------------------
  // Fetch Filtered Lots
  //-----------------------------
  async function load(opts = {}) {
    const {
      silent = false,
      searchOverride,
      pageOverride,
      groupIdOverride,
    } = opts;

    const effSearch = (searchOverride ?? appliedSearch);
    const effPage = (pageOverride ?? page);
    const effGroupId = (groupIdOverride ?? groupId);

    if (!adminKey) {
      if (!silent) toast.error("請先輸入管理員密碼");
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(effPage),
        pageSize: String(PAGE_SIZE),
        groupId: effGroupId,
        search: effSearch,
      });

      const res = await fetch(`${apiBase}/api/admin/devices/phones?${qs.toString()}`, {
        headers: { "x-admin-key": adminKey },
      });
      const data = await res.json();

      console.log('[AdminDevicesPage] data:', data);

      if (!res.ok) {
        toast.error(data?.error || "密碼不正確");
        setIsAdminConfirmed(false);
        throw new Error(data?.error || "load failed");
      }

      setLastFetchAt(Date.now());
      setLastFetchError("");

      // Confirm Admin Status
      if (!isAdminConfirmed) toast.success("密碼正確");
      setIsAdminConfirmed(true);

      const nextRows = Array.isArray(data?.rows) ? data.rows : [];
      setRows(nextRows);
      setMeta(data?.meta || { total: nextRows.length, page, pageSize: PAGE_SIZE });

      // initialize editMap defaults (only if not already edited)
      setEditMap((prev) => {
        const copy = { ...prev };
        for (const r of nextRows) {
          const deviceId = r.deviceId;
          if (copy[deviceId] == null) {
            const suggested = r?.lot?.aiSuggestedNextVacancy;
            const current = r?.lot?.vacancy;
            copy[deviceId] = suggested ?? current ?? "";
          }
        }
        return copy;
      });
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }

  // Auto refresh every 30 seconds (after admin is confirmed)
  useEffect(() => {
    if (!adminKey) return;
    if (!isAdminConfirmed) return;

    const t = setInterval(() => {
      load({ silent: true });
    }, 10_000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, isAdminConfirmed, page, groupId, appliedSearch]);

  
  //-----------------------------
  // Confirm Vacancy
  //-----------------------------

  async function confirmVacancy(deviceId) {
    if (!adminKey) return;

    const vRaw = editMap[deviceId];
    const v = toNum(vRaw);

    if (v == null || v < 0) {
      toast.error("vacancy 必須是 >= 0 的數字");
      return;
    }

    const res = await fetch(`${apiBase}/api/admin/devices/confirm-vacancy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey,
      },
      body: JSON.stringify({ deviceId, vacancy: v }),
    });

    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error || "更新失敗");
      return;
    }

    toast.success("已更新");
    await load();
  }

  async function confirmAllOnPage() {
    if (!adminKey) return;
    if (confirmAllLoading) return;
    if (!rows?.length) return;

    setConfirmAllLoading(true);
    try {
      let okCount = 0;
      let skipCount = 0;

      for (const r of rows) {
        const deviceId = r.deviceId;

        // only if linked lot + valid number
        if (!r?.lot?._id) { skipCount++; continue; }
        const v = toNum(editMap[deviceId]);
        if (v == null || v < 0) { skipCount++; continue; }

        const res = await fetch(`${apiBase}/api/admin/devices/confirm-vacancy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify({ deviceId, vacancy: v }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "更新失敗");
        okCount++;
      }

      toast.success(`本頁已確認 ${okCount} 筆（略過 ${skipCount} 筆）`);
      await load({ silent: true });
    } catch (e) {
      toast.error(e?.message || "本頁全部確認失敗");
    } finally {
      setConfirmAllLoading(false);
    }
  }


  //-----------------------------
  // Pagination
  //-----------------------------
  // load phones when page / group changes
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, groupId]);

  const pageCount = useMemo(() => {
    const total = toNum(meta?.total) ?? 0;
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }, [meta]);

  function onSearchSubmit() {
    const s = search.trim();
    setAppliedSearch(s);
    setPage(1);
    load({ searchOverride: s, pageOverride: 1 });
  }


  const fetchedAgo = lastFetchAt ? minSecAgo(new Date(lastFetchAt)) : null;

  //-----------------------------
  // Return JSX
  //-----------------------------
  return (
    <div className="admin-dev-outer">
      {/* Header */}
      <div className="admin-dev-header">
        <div className="admin-dev-title">Admin Devices</div>

        <div className="admin-dev-adminkey">
          <div className="admin-dev-label">管理員密碼</div>
          <input
            className="admin-dev-input"
            style={{ minWidth: "400px" }}
            value={adminKey}
            onChange={(e) => persistAdminKey(e.target.value)}
            placeholder="admin key"
          />
          <button className="admin-dev-btn" 
            onClick={() => {
              const s = search.trim();
              setAppliedSearch(s);
              setPage(1);
              load({ searchOverride: s, pageOverride: 1 });
            }}
          >
            重新載入
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="admin-dev-filters">
        <select
          className="admin-dev-select"
          value={groupId}
          onChange={(e) => { setGroupId(e.target.value); setPage(1); }}
        >
          <option value="all">所有停車場群組</option>
          {groups.map((g) => (
            <option key={g._id} value={g._id}>
              {g.name || String(g._id)}
            </option>
          ))}
        </select>

        <div className="admin-dev-search">
          <input
            className="admin-dev-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋裝置 ID..."
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearchSubmit();
            }}
          />
          <button className="admin-dev-btn" onClick={onSearchSubmit}>
            搜尋
          </button>
        </div>

        <div style={{ marginLeft: "auto", color: "#777", fontSize: 13 }}>
          <span style={{ marginRight: 10 }}>
            最近載入圖像：{" "}
            {lastFetchAt ? formatTimeYYYYMMDD_HHMMSS(new Date(lastFetchAt)) : "—"}
            {(() => {
              const ms = minSecAgo(new Date(lastFetchAt));
              if (!ms) return null;
              return (
                fetchedAgo 
                ? (<span>（{fetchedAgo.min} 分 {String(fetchedAgo.sec).padStart(2,"0")} 秒前）</span>) 
                : null
              );
            })()}
          </span>
          {lastFetchError ? (
            <span style={{ color: "#c0392b" }}>
              (failed: {lastFetchError})
            </span>
          ) : null}
        </div>

        <div className="admin-dev-pagination-div">
          <button
            className="admin-dev-confirm-all-button"
            style={{ marginLeft: 10, padding: "6px 10px" }}
            disabled={confirmAllLoading || rows.length === 0}
            onClick={confirmAllOnPage}
            title="Confirm all on this page"
          >
            {confirmAllLoading ? (
              <Spinner color="primary" />
              ) : (
              <>
                <FaCheck size={19} />
                <span>確認本頁全部空位</span>
              </>
            )}
          </button>

          {/* Pagination */}
          <div className="admin-dev-page">
            <button
              className="admin-dev-navbtn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              title="Prev"
            >
              <FaChevronLeft />
            </button>

            <div className="admin-dev-pagelabel">
              Page {page} / {pageCount} ({meta?.total ?? 0})
            </div>

            <button
              className="admin-dev-navbtn"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              title="Next"
            >
              <FaChevronRight />
            </button>
          </div>
        </div>

      </div>

      {/* Grid */}
      <div className="admin-dev-body">
        {loading && false ? (
          <div className="d-flex align-items-center justify-content-center py-5">
            <Spinner color="primary" />
          </div>
        ) : (
          rows.length === 0 ? (
            <div className="d-flex align-items-center justify-content-center py-5"
              style={{ color: "#999" }}
            >
              <span>沒有裝置資料</span>
            </div>
          ) : (
            <div className="admin-dev-grid">
            {rows.map((r) => {
              const deviceId = r.deviceId;
              const vacancy = r?.lot?.vacancy ?? "";
              const edited = editMap[deviceId] ?? "";
              
              // shotAgo color rules: > 60s red, > 30s orange
              const lastUploadAt = r?.phone?.lastUploadAt ?? null;
              const shotSecAgo = lastUploadAt
                ? Math.floor((Date.now() - new Date(lastUploadAt).getTime()) / 1000)
                : null;
              const uploadedAgo = lastUploadAt ? minSecAgo(new Date(lastUploadAt)) : null;
              const shotAtColor =
                shotSecAgo == null ? (r?.lot?.name ? "#333" : "#999") :
                shotSecAgo >= 60 ? "#c0392b" :
                shotSecAgo >= 40 ? "#e67e22" :
                (r?.lot?.name ? "#333" : "#999");

              // confirmedAgo color rules: > 60s red, > 30s orange
              const lastConfirmedAt = r?.lot?.lastConfirmedAt ?? null;
              const confirmedSecAgo = lastConfirmedAt
                ? Math.floor((Date.now() - new Date(lastConfirmedAt).getTime()) / 1000)
                : null;
              const confirmedAgo = lastConfirmedAt ? minSecAgo(new Date(lastConfirmedAt)) : null;
              const confirmedAtColor =
                confirmedSecAgo == null ? (r?.lot?.name ? "#333" : "#999") :
                confirmedSecAgo >= 60 ? "#c0392b" :
                confirmedSecAgo >= 30 ? "#e67e22" :
                (r?.lot?.name ? "#333" : "#999");

              const batteryPct = r?.phone?.lastBatteryPct ?? null;
              

              return (
                <div key={deviceId} className="admin-dev-card">
                  <div
                    className="admin-dev-battery-badge"
                    title={batteryPct == null ? "Battery" : `Battery: ${batteryPct}%`}
                    style={{ 
                      color: batteryColor(batteryPct),
                      border: `1px solid ${batteryColor(batteryPct)}`
                    }}
                  >
                    {batteryPct == null ? (
                      <span style={{ color: "#bbb" }}>NA</span>
                    ) : (
                      <>
                        <span style={{ fontWeight: 700 }}>{batteryPct}</span>
                        <span style={{ flexShrink: "0" }}>
                          <BatteryIcon pct={batteryPct} size={16} />
                        </span>
                      </>
                    )}
                  </div>

                  <div className="admin-dev-card-title">

                    <div className="admin-dev-lotmeta">
                      <div>
                        <span style={{ fontSize: "9.5px", color: r?.lot?.name ? "#333" : "#999", marginRight: "2px" }}>
                          [{r?.lot?.lotId ? r.lot.lotId : "-"}]{" "}
                        </span>
                        <span style={{ fontSize: "9.5px", color: r?.lot?.name ? "#333" : "#999" }}>
                          裝置 ID：{deviceId}
                        </span>
                      </div>
                      <span style={{ 
                        fontSize: "13.5px", 
                        color: r?.lot?.name ? "#333" : "#999",
                        paddingBottom: "1px",
                        marginBottom: "3px",
                        marginRight: "34px",
                        borderBottom: "1px solid"
                      }}>
                        {r?.lot?.name ? r.lot.name : "還未設定連結停車場"}
                      </span>
                      <span className="admin-dev-card-shot-time"
                      style={{ fontSize: "8px", marginTop: "1.5px", color: shotAtColor }}>
                        圖像拍攝時間：
                        {lastUploadAt ? formatTimeYYYYMMDD_HHMMSS(new Date(lastUploadAt)) : "—"}
                        {uploadedAgo ? (
                          <span>
                            （{String(uploadedAgo.min).padStart(2, "0")} 分 {String(uploadedAgo.sec).padStart(2, "0")} 秒前）
                          </span>
                        ) : null}
                      </span>
                      <span className="admin-dev-card-confirm-time"
                      style={{ fontSize: "8px", marginTop: "0.5px", color: confirmedAtColor }}>
                        確認空位時間：
                        {lastConfirmedAt ? formatTimeYYYYMMDD_HHMMSS(new Date(lastConfirmedAt)) : "—"}
                        {confirmedAgo ? (
                          <span>
                            （{String(confirmedAgo.min).padStart(2, "0")} 分 {String(confirmedAgo.sec).padStart(2, "0")} 秒前）
                          </span>
                        ) : null}
                      </span>
                    </div>

                    <div className="admin-dev-deviceid">
                      
                    </div>
                  </div>
                  
                  <div className="admin-dev-imgwrap">
                    {r.imageUrl ? (
                      <img className="admin-dev-img" src={r.imageUrl} alt={deviceId} />
                    ) : (
                      <div className="admin-dev-noimg">no image</div>
                    )}
                  </div>

                  <div className="admin-dev-bottom">
                    <div className="admin-dev-vrow">
                      <div className="admin-dev-vlabel">
                        <span style={{ marginRight: "8px" }}>{String(vacancy) || "-"}</span>
                        <span>→{" "}</span>
                      </div>
                      <input
                        className="admin-dev-vinput"
                        value={edited || "-"}
                        onChange={(e) =>
                          setEditMap((prev) => ({ ...prev, [deviceId]: e.target.value }))
                        }
                      />
                      <button
                        className="admin-dev-confirm"
                        onClick={() => confirmVacancy(deviceId)}
                        title="Confirm"
                      >
                        <FaCheck size={19} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          )
        )}
      </div>
    </div>
  );
}

