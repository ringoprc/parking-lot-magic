// frontend/src/pages/AdminDevicesPage.jsx
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import "./AdminDevicesPage.css";

import { FaCheck } from "react-icons/fa6";

import { Spinner } from "reactstrap";

const PAGE_SIZE = 16;

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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

  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: PAGE_SIZE });
  const [loading, setLoading] = useState(false);

  // deviceId -> edited vacancy
  const [editMap, setEditMap] = useState({});


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
  async function load() {
    if (!adminKey) {
      toast.error("請先輸入管理員密碼");
      return;
    }

    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        groupId,
        search: search.trim(),
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
    }
  }


  
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
    setPage(1);
    load();
  }


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
          <button className="admin-dev-btn" onClick={() => { setPage(1); load(); }}>
            進入
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
              return (
                <div key={deviceId} className="admin-dev-card">
                  <div className="admin-dev-card-title">
                    {r?.lot?.name || r?.lot?.lotId ? (
                      <div className="admin-dev-lotmeta">
                        {r?.lot?.name ? r.lot.name : ""}{r?.lot?.name && r?.lot?.lotId ? " · " : ""}
                        {r?.lot?.lotId ? r.lot.lotId : ""}
                      </div>
                    ) : null}
                    <div className="admin-dev-deviceid">
                      <span>{deviceId}</span>
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
                        <span style={{ marginRight: "8px" }}>{String(vacancy)}</span>
                        <span>→{" "}</span>
                      </div>
                      <input
                        className="admin-dev-vinput"
                        value={edited}
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

