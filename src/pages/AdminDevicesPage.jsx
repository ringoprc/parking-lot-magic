// frontend/src/pages/AdminDevicesPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import "./AdminDevicesPage.css";
import { Spinner, Modal, ModalHeader, ModalBody, ModalFooter } from "reactstrap";

import { 
  formatTime, 
  formatTimeYYYYMMDD_HHMMSS, 
  minutesAgo, 
  minSecAgo 
} from "../utils/time";

import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { FaCheck, FaPencilAlt } from "react-icons/fa";
import { 
  PiBatteryVerticalFull,
  PiBatteryVerticalHigh,
  PiBatteryVerticalMedium,
  PiBatteryVerticalLow
} from "react-icons/pi";
import { GoArrowRight } from "react-icons/go";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 40];
const DEFAULT_PAGE_SIZE = 10;

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
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE });

  const [loading, setLoading] = useState(false);

  // deviceId -> edited vacancy
  const [editMap, setEditMap] = useState({});
  const [confirmAllLoading, setConfirmAllLoading] = useState(false);

  const [zoomMap, setZoomMap] = useState({});          // deviceId -> number (1.0..4.0)
  const [zoomSavingMap, setZoomSavingMap] = useState({}); // deviceId -> boolean


  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkModalDevice, setLinkModalDevice] = useState(null);

  const [lotSearchText, setLotSearchText] = useState("");
  const [lotSuggestions, setLotSuggestions] = useState([]);
  const [lotSuggestionsLoading, setLotSuggestionsLoading] = useState(false);
  const [lotSuggestionsOpen, setLotSuggestionsOpen] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState("");

  const [linkSaving, setLinkSaving] = useState(false);

  const lotSearchContainerRef = useRef(null);
  const lotSuggestTimerRef = useRef(null);
  const skipNextLotSuggestRef = useRef(false);

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
      pageSizeOverride,
    } = opts;

    const effSearch = (searchOverride ?? appliedSearch);
    const effPage = (pageOverride ?? page);
    const effGroupId = (groupIdOverride ?? groupId);
    const effPageSize = (pageSizeOverride ?? pageSize);

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
        pageSize: String(effPageSize),
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
      setMeta(data?.meta || { total: nextRows.length, page: effPage, pageSize: effPageSize });

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

      setZoomMap((prev) => {
        const copy = { ...prev };
        for (const r of nextRows) {
          const deviceId = r.deviceId;
          if (copy[deviceId] == null) {
            // expects backend to return r.zoomRatio (see backend patch below)
            const z = Number(r?.zoomRatio);
            copy[deviceId] = Number.isFinite(z) ? z : 1.0;
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
  }, [adminKey, isAdminConfirmed, page, groupId, appliedSearch, pageSize]);

  
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
  // Save Zoom
  //-----------------------------
  async function saveZoom(deviceId) {
    if (!adminKey) return;

    const zRaw = zoomMap[deviceId];
    const z = Number(zRaw);
    if (!Number.isFinite(z)) return;

    const zoomRatio = Math.max(1.0, Math.min(4.0, z));

    setZoomSavingMap((p) => ({ ...p, [deviceId]: true }));
    try {
      const res = await fetch(`${apiBase}/api/admin/devices/${encodeURIComponent(deviceId)}/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ zoomRatio }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "zoom update failed");

      // normalize state to server response (in case it clamps)
      setZoomMap((p) => ({ ...p, [deviceId]: data.zoomRatio ?? zoomRatio }));
    } catch (e) {
      toast.error(e?.message || "zoom update failed");
    } finally {
      setZoomSavingMap((p) => ({ ...p, [deviceId]: false }));
    }
  }


  //-----------------------------
  // Pagination
  //-----------------------------
  // load phones when page / group changes
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, groupId, pageSize]);

  const pageCount = useMemo(() => {
    const total = toNum(meta?.total) ?? 0;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [meta, pageSize]);

  function onSearchSubmit() {
    const s = search.trim();
    setAppliedSearch(s);
    setPage(1);
    load({ searchOverride: s, pageOverride: 1 });
  }


  const fetchedAgo = lastFetchAt ? minSecAgo(new Date(lastFetchAt)) : null;


  //-----------------------------
  // Link Device <-> Lot Modal
  //-----------------------------
  async function fetchLotSuggestions(query, opts = {}) {
    if (!adminKey) return;

    const {
      keepSelectedLotId = "",
      openDropdown = true,
      silent = false,
    } = opts;

    const q = String(query ?? "").trim();

    if (!q) {
      setLotSuggestions([]);
      setLotSuggestionsOpen(false);
      return;
    }

    setLotSuggestionsLoading(true);
    try {
      const qs = new URLSearchParams({
        query: q,
        limit: "8",
      });

      const res = await fetch(`${apiBase}/api/admin/lots/suggest?${qs.toString()}`, {
        headers: { "x-admin-key": adminKey },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "load lots failed");

      const nextRows = Array.isArray(data?.rows) ? data.rows : [];
      setLotSuggestions(nextRows);
      setLotSuggestionsOpen(openDropdown && nextRows.length > 0);

      if (keepSelectedLotId) {
        const found = nextRows.find((x) => String(x?._id) === String(keepSelectedLotId));
        if (found) setSelectedLotId(String(found._id));
      }
    } catch (e) {
      if (!silent) toast.error(e?.message || "停車場搜尋失敗");
      setLotSuggestions([]);
      setLotSuggestionsOpen(false);
    } finally {
      setLotSuggestionsLoading(false);
    }
  }

  function openLinkModal(row) {
    const currentLotId = row?.lot?._id ? String(row.lot._id) : "";
    const currentLotName = row?.lot?.name ? String(row.lot.name) : "";

    setLinkModalDevice(row);
    setLinkModalOpen(true);
    setLotSearchText(currentLotName);
    setSelectedLotId(currentLotId);
    setLotSuggestions([]);
    setLotSuggestionsOpen(false);

    if (currentLotName) {
      fetchLotSuggestions(currentLotName, {
        keepSelectedLotId: currentLotId,
        openDropdown: false,
        silent: true,
      });
    }
  }

  function closeLinkModal() {
    setLinkModalOpen(false);
    setLinkModalDevice(null);
    setLotSearchText("");
    setLotSuggestions([]);
    setLotSuggestionsOpen(false);
    setSelectedLotId("");

    if (lotSuggestTimerRef.current) {
      clearTimeout(lotSuggestTimerRef.current);
      lotSuggestTimerRef.current = null;
    }
  }

  async function saveDeviceLotLink() {
    if (!adminKey) return;
    if (!linkModalDevice?.deviceId) return;

    if (!selectedLotId) {
      toast.error("請先選擇停車場");
      return;
    }

    setLinkSaving(true);
    try {
      const res = await fetch(
        `${apiBase}/api/admin/devices/${encodeURIComponent(linkModalDevice.deviceId)}/link-lot`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify({
            lotId: selectedLotId,
            force: true,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "link failed");

      toast.success("已更新裝置連結停車場");
      closeLinkModal();
      await load({ silent: true });
    } catch (e) {
      toast.error(e?.message || "裝置連結停車場失敗");
    } finally {
      setLinkSaving(false);
    }
  }

  async function unlinkDeviceFromLot() {
    if (!adminKey) return;
    if (!linkModalDevice?.deviceId) return;

    setLinkSaving(true);
    try {
      const currentLotId =
        linkModalDevice?.lot?._id || linkModalDevice?.phone?.parkingLotId || "";

      if (!currentLotId) {
        toast.success("此裝置目前未連結停車場");
        closeLinkModal();
        await load({ silent: true });
        return;
      }

      const res = await fetch(
        `${apiBase}/api/admin/lots/${encodeURIComponent(currentLotId)}/devices/${encodeURIComponent(linkModalDevice.deviceId)}`,
        {
          method: "DELETE",
          headers: {
            "x-admin-key": adminKey,
          },
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "unlink failed");

      toast.success("已取消裝置與停車場的連結");
      closeLinkModal();
      await load({ silent: true });
    } catch (e) {
      toast.error(e?.message || "取消連結失敗");
    } finally {
      setLinkSaving(false);
    }
  }

  useEffect(() => {
    if (!linkModalOpen) return;

    if (skipNextLotSuggestRef.current) {
      skipNextLotSuggestRef.current = false;
      return;
    }

    const q = String(lotSearchText ?? "").trim();

    if (lotSuggestTimerRef.current) {
      clearTimeout(lotSuggestTimerRef.current);
      lotSuggestTimerRef.current = null;
    }

    if (!q) {
      setLotSuggestions([]);
      setLotSuggestionsOpen(false);
      return;
    }

    lotSuggestTimerRef.current = setTimeout(() => {
      fetchLotSuggestions(q, {
        keepSelectedLotId: selectedLotId,
        openDropdown: true,
        silent: true,
      });
    }, 250);

    return () => {
      if (lotSuggestTimerRef.current) {
        clearTimeout(lotSuggestTimerRef.current);
        lotSuggestTimerRef.current = null;
      }
    };
  }, [lotSearchText, linkModalOpen, selectedLotId]);

  useEffect(() => {
    if (!linkModalOpen) return;

    function handleClickOutside(e) {
      if (
        lotSearchContainerRef.current &&
        !lotSearchContainerRef.current.contains(e.target)
      ) {
        setLotSuggestionsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [linkModalOpen]);


  //-----------------------------
  // Return JSX
  //-----------------------------
  return (
    <div className="admin-dev-outer">
      {/* Header */}
      <div className="admin-dev-header">
        <div className="admin-dev-title">裝置管理頁面</div>

        <div className="admin-dev-adminkey">
          <div className="admin-dev-label">管理員密碼</div>
          <div>
            <input
              className="admin-dev-input admin-password"
              value={adminKey}
              onChange={(e) => persistAdminKey(e.target.value)}
              placeholder="admin key"
            />
            <button className="admin-dev-btn apply-password" 
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
      </div>

      {/* Filters */}
      <div className="admin-dev-filters">

        <div className="admin-dev-select-outer-div">
          <select
            className="admin-dev-select parking-log-groups"
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
              className="admin-dev-input search-device-id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋裝置 ID..."
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearchSubmit();
              }}
            />
            <button className="admin-dev-btn apply-search-id" onClick={onSearchSubmit}>
              搜尋
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          
          <div className="admin-dev-lastfetchat-div">
            <span style={{ marginRight: 10 }}>
              最近載入圖像：{" "}
            </span>
            <span>
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

          <div className="admin-dev-pagination-outer-div">

            <div className="admin-dev-confirm-all-button-div">
              <button
                className="admin-dev-confirm-all-button"
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
            </div>

            <div className="admin-dev-pagination-div">
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 10 }}>
                <span className="admin-dev-page-size-label">每頁</span>
                <select
                  className="admin-dev-select page-size-select"
                  value={pageSize}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setPageSize(next);
                    setPage(1);
                    load({ pageOverride: 1, pageSizeOverride: next });
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pagination */}
              <div className="admin-dev-pagination">
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
                shotSecAgo >= 60 ? "#de1802" :
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
                confirmedSecAgo >= 60 ? "#de1802" :
                confirmedSecAgo >= 30 ? "#e67e22" :
                (r?.lot?.name ? "#333" : "#999");

              const batteryPct = r?.phone?.lastBatteryPct ?? null;
              

              return (
                <div key={deviceId} className="admin-dev-card">
                  <div className="admin-dev-zoombar" title="Zoom">
                    <input
                      className="admin-dev-zoomrange"
                      type="range"
                      min="1"
                      max="4"
                      step="0.1"
                      value={zoomMap[deviceId] ?? 1.0}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setZoomMap((p) => ({ ...p, [deviceId]: v }));
                      }}
                      onMouseUp={() => saveZoom(deviceId)}
                      onTouchEnd={() => saveZoom(deviceId)}
                    />
                    <div className="admin-dev-zoomlabel">
                      {(Number(zoomMap[deviceId] ?? 1.0)).toFixed(1)}x
                    </div>
                  </div>

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
                        borderBottom: "1px solid",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        maxWidth: "84%",
                        overflow: "hidden"
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

                  <div className="admin-dev-bottom" style={{ position: "relative" }}>
                    <button
                      type="button"
                      title="設定停車場連結"
                      onClick={() => openLinkModal(r)}
                      style={{
                        position: "absolute",
                        left: "12px",
                        bottom: "10px",
                        border: "1px solid #2a8fe0",
                        background: "#fff",
                        width: "28px",
                        height: "28px",
                        borderRadius: "7px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: "#2a8fe0",
                        zIndex: 2,
                        padding: 0,
                      }}
                    >
                      <FaPencilAlt size={13} />
                    </button>

                    <div className="admin-dev-vrow">
                      <div className="admin-dev-vlabel">
                        <span style={{ marginRight: "8px" }}>{String(vacancy) || "-"}</span>
                        <span style={{ paddingBottom: "5px" }}>
                          <GoArrowRight size={18} />
                        </span>
                      </div>
                      <input
                        className="admin-dev-vinput"
                        value={edited ?? ""}
                        placeholder="-"
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

      <Modal isOpen={linkModalOpen} toggle={closeLinkModal} centered>
        <ModalHeader toggle={closeLinkModal}>設定裝置停車場連結</ModalHeader>
        <ModalBody style={{ minHeight: "65vh" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>裝置 ID</div>
              <div style={{ fontWeight: 700, fontSize: "12px" }}>{linkModalDevice?.deviceId || "-"}</div>
            </div>

            <div>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>目前停車場</div>
              <div style={{ fontWeight: 700, fontSize: "12px" }}>{linkModalDevice?.lot?.name || "尚未連結"}</div>
            </div>

            <div
              ref={lotSearchContainerRef}
              style={{ position: "relative" }}
            >
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>搜尋停車場</div>
              <input
                className="admin-dev-input modal-search-input"
                value={lotSearchText}
                onChange={(e) => {
                  setLotSearchText(e.target.value);
                  setLotSuggestionsOpen(true);
                }}
                onFocus={() => {
                  if (lotSuggestions.length > 0) setLotSuggestionsOpen(true);
                }}
                placeholder="輸入 lotId、名稱、地址..."
                autoComplete="off"
              />

              {lotSuggestionsLoading ? (
                <div
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "34px",
                    fontSize: "11px",
                    color: "#888",
                  }}
                >
                  搜尋中...
                </div>
              ) : null}

              {lotSuggestionsOpen && lotSuggestions.length > 0 ? (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: "100%",
                    marginTop: "6px",
                    background: "#fff",
                    border: "1px solid #d9dee7",
                    borderRadius: "10px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                    overflow: "hidden",
                    zIndex: 20,
                    maxHeight: "240px",
                    overflowY: "auto",
                  }}
                >
                  {lotSuggestions.map((lot) => {
                    const isSelected = String(selectedLotId) === String(lot._id);

                    return (
                      <button
                        key={lot._id}
                        type="button"
                        onClick={() => {
                          skipNextLotSuggestRef.current = true;
                          setSelectedLotId(String(lot._id));
                          setLotSearchText(`[${lot.lotId || "-"}] ${lot.name || ""}`);
                          setLotSuggestionsOpen(false);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 12px",
                          border: "none",
                          borderBottom: "1px solid #eef2f6",
                          background: isSelected ? "#f4f8ff" : "#fff",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#333" }}>
                          [{lot.lotId || "-"}] {lot.name || "-"}
                        </div>
                        <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                          {lot.district || "-"}{lot.addressZh ? `｜${lot.addressZh}` : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {selectedLotId ? (() => {
              const chosen =
                lotSuggestions.find((lot) => String(lot._id) === String(selectedLotId)) ||
                (linkModalDevice?.lot && String(linkModalDevice.lot._id) === String(selectedLotId)
                  ? linkModalDevice.lot
                  : null);

              if (!chosen) return null;

              return (
                <div style={{ fontSize: "12px", color: "#555", lineHeight: 1.5 }}>
                  <div>lotId：{chosen.lotId || "-"}</div>
                  <div>名稱：{chosen.name || "-"}</div>
                  <div>行政區：{chosen.district || "-"}</div>
                  <div>地址：{chosen.addressZh || "-"}</div>
                </div>
              );
            })() : null}
          </div>
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            className="admin-dev-btn"
            onClick={closeLinkModal}
            disabled={linkSaving}
          >
            取消
          </button>

          <button
            type="button"
            className="admin-dev-btn"
            onClick={unlinkDeviceFromLot}
            disabled={linkSaving}
            style={{
              borderColor: "#e5c1c1",
              color: "#b42318",
              background: "#fff",
            }}
          >
            取消連結到任何停車場
          </button>

          <button
            type="button"
            className="admin-dev-btn"
            onClick={saveDeviceLotLink}
            disabled={linkSaving || !selectedLotId}
          >
            {linkSaving ? "儲存中..." : "儲存"}
          </button>
        </ModalFooter>
      </Modal>

    </div>
  );
}

