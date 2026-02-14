// frontend/src/pages/AdminLotsPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";

import { FiTrash2 } from "react-icons/fi";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";

import './AdminLotsPage.css';

const PAGE_SIZE = 200;

function cellStyle(isDirty, editableColor) {
  return {
    border: "1px solid #e6e6e6",
    padding: "6px 8px",
    minWidth: 90,
    background: isDirty ? "#ffc56f" : (editableColor || "#fff"),
  };
}

const STICKY_COL_W = {
  copy: 96,
  lotId: 156,
  name: 257,
};

function stickyLeftStyle(colIndex, isHeader = false) {
  // colIndex: 0=copy, 1=lotId, 2=name
  const left =
    colIndex === 0 ? 0 :
    colIndex === 1 ? STICKY_COL_W.copy :
    colIndex === 2 ? (STICKY_COL_W.copy + STICKY_COL_W.lotId) :
    0;

  return {
    position: "sticky",
    left,
    zIndex: isHeader ? 20 : 10,
    background: isHeader ? "#f7f7f7" : "#fff",
    boxShadow: colIndex === 2 ? "6px 0 0 rgba(0,0,0,0.03)" : undefined, // subtle divider
  };
}

function toLocalParts(d) {
  if (!d) return { yyyy: "", mm: "", dd: "", hh: "", min: "" };
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return { yyyy: "", mm: "", dd: "", hh: "", min: "" };
  return {
    yyyy: x.getFullYear(),
    mm: x.getMonth() + 1,
    dd: x.getDate(),
    hh: x.getHours(),
    min: x.getMinutes(),
  };
}

export default function AdminLotsPage({ apiBase }) {
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem("adminKey") || "");
  const [isAdminConfirmed, setIsAdminConfirmed] = useState(false);
  const [page, setPage] = useState(1);
  const [district, setDistrict] = useState("all");
  const [search, setSearch] = useState("");

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: PAGE_SIZE });
  const [loading, setLoading] = useState(false);

  const originalRef = useRef(new Map()); // _id -> JSON string snapshot
  const dirtyIds = useMemo(() => {
    const s = new Set();
    for (const r of rows) {
      const k = r._id;
      const snap = originalRef.current.get(k);
      if (snap && snap !== JSON.stringify(r)) s.add(k);
    }
    return s;
  }, [rows]);

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
        district,
        search,
      });
      const res = await fetch(`${apiBase}/api/admin/lots?${qs.toString()}`, {
        headers: { "x-admin-key": adminKey },
      });

      console.log('res:', res);
      console.log('res.ok:', res.ok);

      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.error || "密碼不正確");
        setIsAdminConfirmed(false);
        throw new Error(data?.error || "load failed");
      }

      toast.success((isAdminConfirmed ? "已套用條件" : "密碼正確"));

      setIsAdminConfirmed(true);

      // normalize + add yyyy/mm/dd/hh/min columns for editing
      const normalized = (data.rows || []).map((r) => {
        const parts = toLocalParts(r.lastUpdated);
        return {
          ...r,
          lat: r.location?.coordinates?.[1] ?? "",
          lng: r.location?.coordinates?.[0] ?? "",
          yyyy: parts.yyyy,
          mm: parts.mm,
          dd: parts.dd,
          hh: parts.hh,
          min: parts.min,
        };
      });

      setRows(normalized);
      setMeta(data.meta);

      const m = new Map();
      for (const r of normalized) m.set(r._id, JSON.stringify(r));
      originalRef.current = m;
    } catch(e) {

    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, district]);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    lotId: "",
    name: "",
    addressZh: "",
    district: "",
    lat: "",
    lng: "",
    isActive: true,
    note: "",
  });

  function openAddModal() {
    setAddForm({
      lotId: "",
      name: "",
      addressZh: "",
      district: district === "all" ? "" : district,
      lat: "",
      lng: "",
      isActive: true,
      note: "",
    });
    setAddOpen(true);
  }

  function closeAddModal() {
    setAddOpen(false);
  }

  useEffect(() => {
    if (!addOpen) return;

    function onKeyDown(e) {
      if (e.key === "Escape") closeAddModal();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "enter") {
        // Cmd/Ctrl + Enter submits
        submitAddModal(e);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addOpen, adminKey, addForm]); // ok for now

  async function submitAddModal(e) {
    e?.preventDefault?.();
    if (!adminKey) return;

    const lotId = String(addForm.lotId || "").trim();
    const name = String(addForm.name || "").trim();
    if (!lotId || !name) {
      toast.error("lotId 和 停車場名稱 是必填欄位");
      return;
    }

    const payload = {
      lotId,
      name,
      addressZh: addForm.addressZh,
      district: addForm.district,
      note: addForm.note,
      isActive: !!addForm.isActive,
      lat: addForm.lat,
      lng: addForm.lng,
    };

    const res = await fetch(`${apiBase}/api/admin/lots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error || "新增停車場資料失敗");
      return;
    }

    closeAddModal();
    await load();
    toast.success("新增成功");
  }

  function updateCell(id, key, value) {
    setRows((prev) =>
      prev.map((r) => (r._id === id ? { ...r, [key]: value } : r))
    );
  }

  async function saveAll() {
    if (!adminKey) return;
    const dirty = rows.filter((r) => dirtyIds.has(r._id));
    if (!dirty.length) return;

    const res = await fetch(`${apiBase}/api/admin/bulkUpsert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey,
      },
      body: JSON.stringify({ rows: dirty }),
    });

    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error || "更新資料失敗");
      return;
    }
    await load();
    toast.success(`已儲存 ${dirty.length} 筆變更`);
  }

  async function addRow() {
    openAddModal();
  }

  async function delRow(id) {
    if (!adminKey) return;
    if (!confirm("Delete this row?")) return;

    const res = await fetch(`${apiBase}/api/admin/lots/${id}`, {
      method: "DELETE",
      headers: { "x-admin-key": adminKey },
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data?.error || "刪除停車場資料失敗");
    await load();
    toast.success("已刪除");
  }

  const totalPages = Math.max(1, Math.ceil((meta.total || 0) / PAGE_SIZE));
  const shownCount = rows.length;
  const matchedTotal = meta.total || 0;
  const totalAll = meta.totalAll ?? null;

  const isFiltering = district !== "all" || !!search.trim();
  const showingLabel = isFiltering
    ? `顯示中 ${shownCount}（符合條件 ${matchedTotal}${totalAll != null ? ` / 全部 ${totalAll}` : ""}）`
    : `顯示中 ${shownCount} / ${matchedTotal}`;

  function tsvCell(v) {
    if (v == null) return "";
    // prevent breaking TSV rows if user has tabs/newlines in text
    return String(v).replace(/\t/g, " ").replace(/\r?\n/g, " ");
  }


  //--------------------------------
  // Excel Export
  //--------------------------------
  async function exportToExcel() {
    if (!adminKey) {
      toast.error("請先輸入管理員密碼");
      return;
    }

    try {
      toast.loading("匯出中...");

      let allRows = [];
      let pageNum = 1;
      const pageSize = 500; // use backend max
      let total = 0;

      while (true) {
        const qs = new URLSearchParams({
          page: String(pageNum),
          pageSize: String(pageSize),
          district,
          search,
        });

        const res = await fetch(`${apiBase}/api/admin/lots?${qs.toString()}`, {
          headers: { "x-admin-key": adminKey },
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "匯出失敗");
        }

        allRows = [...allRows, ...(data.rows || [])];
        total = data.meta?.total ?? data.total ?? 0;

        if (allRows.length >= total) break;
        pageNum++;
      }

      if (!allRows.length) {
        toast.dismiss();
        toast.error("沒有資料可匯出");
        return;
      }

      // format data for excel
      const exportData = allRows.map(r => ({
        lotId: r.lotId,
        name: r.name,
        addressZh: r.addressZh,
        district: r.district,
        lat: r.location?.coordinates?.[1],
        lng: r.location?.coordinates?.[0],
        vacancy: r.vacancy,
        status: r.status,
        lastUpdated: r.lastUpdated,
        note: r.note,
        isActive: r.isActive ? "TRUE" : "FALSE",
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Lots");

      XLSX.writeFile(workbook, "parking-lots.xlsx");

      toast.dismiss();
      toast.success(`已匯出 ${exportData.length} 筆資料`);

    } catch (err) {
      toast.dismiss();
      toast.error("匯出失敗");
      console.error(err);
    }
  }

  //--------------------------------
  // Copy Row Data
  //--------------------------------

  function rowToTsv(r) {
    // keep same order as your columns
    const cells = [
      r.lotId,
      r.name,
      r.addressZh,
      r.district,
      r.lat,
      r.lng,
      r.vacancy ?? "",
      r.yyyy ?? "",
      r.mm ?? "",
      r.dd ?? "",
      r.hh ?? "",
      r.min ?? "",
      r.status ?? "",
      r.note ?? "",
      /*r.isActive ? "TRUE" : "FALSE",*/
    ].map(tsvCell);

    return cells.join("\t");
  }

  async function copyRow(r) {
    const text = rowToTsv(r) + "\n"; // newline makes pasting multiple rows nicer
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback for older browsers / permission issues
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  const districtOptions = useMemo(() => {
    return (meta?.allDistricts || []);
  }, [meta]);

  const colWidths = useMemo(() => ([
    STICKY_COL_W.copy,
    STICKY_COL_W.lotId,
    STICKY_COL_W.name,
    340, // addressZh
    120, // district
    140, // lat
    140, // lng
    100, // vacancy
    70,  // yyyy
    60,  // mm
    60,  // dd
    60,  // hh
    60,  // min
    90,  // status
    200, // note
    120, // showOnMap
    90,  // delete
  ]), []);

  return (
    <div className="admin-lot-outer-div">

      <div className="admin-lot-action-outer-row">

        <div className="admin-lot-title-row">
          <div className="admin-lot-title">
            管理停車場資訊
          </div>
        </div>

        <div className="admin-lot-password-outer-div">
          <div className="admin-lot-password-row">
            <div>
              <p className="mb-0 admin-lot-password-label">管理員密碼：</p>
            </div>
            <div style={{ maxWidth: "calc(100% - 90px)" }}>
              <input className="admin-lot-password-input"
                placeholder="輸入密碼 (自動儲存於主機上)"
                value={adminKey}
                onChange={(e) => {
                  setAdminKey(e.target.value);
                  setIsAdminConfirmed(false);
                  localStorage.setItem("adminKey", e.target.value);
                }}
              />
            </div>
          </div>

          <div className="admin-lot-action-row">
            <button className="admin-lot-action-btn"
              onClick={load}
            >
              {isAdminConfirmed ? "重新讀取" : "確認密碼"}
            </button>
            <button 
              className={`admin-lot-action-btn ` 
                + (dirtyIds.size>0 ? "should-save ": " ")
              }
              onClick={saveAll} 
              disabled={!dirtyIds.size} 
            >
              儲存變更 ({dirtyIds.size})
            </button>
            <button className="admin-lot-action-btn"
              onClick={addRow} 
            >
              + 新增
            </button>
            <button className="admin-lot-action-btn"
              onClick={exportToExcel}
            >
              匯出 Excel
            </button>
          </div>
        </div>

      </div>

      <div className="admin-lot-search-outer-row">

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            alignItems: "center"
          }}
        >
          <div>
            <select
              className="admin-lot-search-district-select"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            >
              <option value="all">所有區域</option>
              {districtOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="admin-lot-input-div"
            style={{ display: "flex", gap: "10px" }}
          >
            <input
              className="admin-lot-search-input"
              placeholder="搜尋 (lotId/停車場名稱/地址/備註)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  load();
                }
              }}
            />

            <button className="admin-lot-search-btn"
              onClick={() => { setPage(1); load(); }} 
            >
              搜尋
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              fontSize: 13,
              color: "#666",
              whiteSpace: "nowrap",
            }}
          >
            {isFiltering ? showingLabel : null}
          </div>

          <div className="admin-lot-page-navigate">
            <button className="admin-lot-navigate-btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              <FaChevronLeft size={18} />
            </button>
            <div className="admin-lot-navigate-label">{page} / {totalPages}</div>
            <button className="admin-lot-navigate-btn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              <FaChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="admin-lot-table-outer-div">
        <table
          style={{
            /*borderCollapse: "separate",*/
            borderSpacing: 0,
            tableLayout: "fixed",
            width: "max-content",
            minWidth: "100%",
          }}
        >

          <colgroup>
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>

          <thead style={{ position: "sticky", 
            top: "-1px", background: "#f7f7f7", zIndex: "30", 
            borderBottom: "1px solid #666",
          }}>
            <tr>
              {[
                "複製","lotId","停車場名稱","地址","區域","lat 緯度","lng 經度","空位數",
                "年","月","日","時","分","狀態","備註","顯示於地圖", "刪除"
              ].map((h, idx) => (
                <th key={h} 
                  style={{ 
                    border: "1px solid #e6e6e6",
                    padding: "0px 0px", 
                    textAlign: "left", 
                    whiteSpace: "nowrap",
                    ...(idx <= 2 ? stickyLeftStyle(idx, true) : null),
                  }}
                >
                  <div
                    style={{
                      width: "calc(100% + 2px)",
                      height: "40px",
                      padding: "6px 8px 6px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginLeft: "-1px",
                      marginRight: "-1px",
                      boxShadow: "inset -1px -1px 0 #6c6c6c, inset 1px 1px 0 #8c8a8a",
                    }}
                  >
                    <span>{h}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const isDirty = dirtyIds.has(r._id);
              return (
                <tr key={r._id}>

                  {/* copy */}
                  <td style={{ ...cellStyle(false, "#fff"), ...stickyLeftStyle(0, false) }}
                    className="admin-lot-border-right-td" 
                  >
                    <button className="admin-lot-copy-btn" 
                      onClick={() => copyRow(r)} 
                      style={{ padding: "6px 10px", width: 80 }}
                    >
                      Copy
                    </button>
                  </td>

                  {/* lotId (editable: light blue like your note) */}
                  <td style={{ ...cellStyle(isDirty, "#e3e3e3"), ...stickyLeftStyle(1, false) }}
                    className="admin-lot-border-right-td" 
                  >
                    <input className="admin-lot-td-input" 
                      value={r.lotId || ""} 
                      onChange={(e) => updateCell(r._id, "lotId", e.target.value)} 
                      style={{ width: 140 }} 
                    />
                  </td>

                  <td style={{ ...cellStyle(isDirty, "#e3e3e3"), ...stickyLeftStyle(2, false) }}
                    className="admin-lot-border-right-td" 
                  >
                    <input className="admin-lot-td-input" 
                      value={r.name || ""} 
                      onChange={(e) => updateCell(r._id, "name", e.target.value)} 
                      style={{ width: 240 }} 
                    />
                  </td>

                  <td style={cellStyle(isDirty, "#e3e3e3")}>
                    <input className="admin-lot-td-input" 
                      value={r.addressZh || ""} 
                      onChange={(e) => updateCell(r._id, "addressZh", e.target.value)} 
                      style={{ width: 320 }} 
                    />
                  </td>

                  <td style={cellStyle(isDirty, "#e3e3e3")}>
                    <input className="admin-lot-td-input" 
                      value={r.district || ""} 
                      onChange={(e) => updateCell(r._id, "district", e.target.value)} 
                      style={{ width: 90 }} 
                    />
                  </td>

                  <td style={cellStyle(isDirty, "#e3e3e3")}>
                    <input className="admin-lot-td-input" 
                      value={r.lat} 
                      onChange={(e) => updateCell(r._id, "lat", e.target.value)} 
                      style={{ width: 110 }} 
                    />
                  </td>

                  <td style={cellStyle(isDirty, "#e3e3e3")}>
                    <input className="admin-lot-td-input" 
                      value={r.lng} 
                      onChange={(e) => updateCell(r._id, "lng", e.target.value)} 
                      style={{ width: 110 }} 
                    />
                  </td>

                  {/* vacancy (editable: light yellow like sheet) */}
                  <td style={cellStyle(isDirty, "#fff7d6")}>
                    <input className="admin-lot-td-input" 
                      value={r.vacancy ?? ""} 
                      onChange={(e) => updateCell(r._id, "vacancy", e.target.value)} 
                      style={{ width: 70 }} 
                    />
                  </td>

                  {["yyyy","mm","dd","hh","min"].map((k) => (
                    <td key={k} style={cellStyle(isDirty, "#fff7d6")}>
                      <input className="admin-lot-td-input" 
                        value={r[k] ?? ""} 
                        onChange={(e) => updateCell(r._id, k, e.target.value)} 
                        style={{ width: 60 }} 
                      />
                    </td>
                  ))}

                  <td style={cellStyle(isDirty, "#fff")}>
                    <select 
                      className="admin-lot-td-select"
                      value={r.status || "unknown"} 
                      onChange={(e) => updateCell(r._id, "status", e.target.value)}
                    >
                      <option value="ok">ok</option>
                      <option value="unknown">unknown</option>
                      <option value="down">down</option>
                    </select>
                  </td>

                  <td style={cellStyle(isDirty, "#fff")}>
                    <input className="admin-lot-td-input" 
                      value={r.note || ""} 
                      onChange={(e) => updateCell(r._id, "note", e.target.value)} 
                      style={{ width: 220 }} 
                    />
                  </td>

                  <td style={{...cellStyle(isDirty, "#fff"), ...{textAlign: "center"}}}>
                    <input className="admin-lot-td-input" 
                      type="checkbox"
                      checked={!!r.isActive}
                      onChange={(e) => updateCell(r._id, "isActive", e.target.checked)}
                    />
                  </td>

                  <td style={{...cellStyle(false, "#fff"), ...{textAlign: "center"}}}>
                  <button className="admin-lot-delete-btn" 
                    onClick={() => delRow(r._id)}
                  >
                    <FiTrash2 size={17} />
                  </button>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                {/* colSpan={7} is correct visually */}
                <td colSpan={7} className="admin-lot-td-no-data">
                  {isAdminConfirmed ? "沒有資料" : "輸入管理員密碼"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>


      {/* Add Lot Modal */}
      {addOpen && (
        <div
          onMouseDown={(e) => {
            // click outside to close
            if (e.target === e.currentTarget) closeAddModal();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <form
            onSubmit={submitAddModal}
            style={{
              width: "min(720px, 100%)",
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e6e6e6",
              boxShadow: "0 12px 36px rgba(0,0,0,0.18)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid #eee",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontWeight: 700 }}>Add Parking Lot</div>
              <button type="button" onClick={closeAddModal} 
                style={{ padding: "6px 12px", borderRadius: "10px" }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: "14px" }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>lotId *</div>
                  <input
                    autoFocus
                    value={addForm.lotId}
                    onChange={(e) => setAddForm((p) => ({ ...p, lotId: e.target.value }))}
                    style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8 }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>停車場名稱 *</div>
                  <input
                    value={addForm.name}
                    onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                    style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8 }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 12, color: "#666" }}>中文地址</div>
                  <input
                    value={addForm.addressZh}
                    onChange={(e) => setAddForm((p) => ({ ...p, addressZh: e.target.value }))}
                    style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8 }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>區域</div>
                  <input
                    value={addForm.district}
                    onChange={(e) => setAddForm((p) => ({ ...p, district: e.target.value }))}
                    style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8 }}
                    placeholder="e.g. 大同區"
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>備註</div>
                  <input
                    value={addForm.note}
                    onChange={(e) => setAddForm((p) => ({ ...p, note: e.target.value }))}
                    style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8 }}
                    placeholder="可不填"
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>lat 緯度（~25）</div>
                  <input
                    value={addForm.lat}
                    onChange={(e) => setAddForm((p) => ({ ...p, lat: e.target.value }))}
                    style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8 }}
                    placeholder="25.0..."
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>lng 經度（~120）</div>
                  <input
                    value={addForm.lng}
                    onChange={(e) => setAddForm((p) => ({ ...p, lng: e.target.value }))}
                    style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8 }}
                    placeholder="121.5..."
                  />
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <input
                    type="checkbox"
                    checked={!!addForm.isActive}
                    onChange={(e) => setAddForm((p) => ({ ...p, isActive: e.target.checked }))}
                  />
                  <span style={{ fontSize: 13 }}>顯示於地圖上</span>
                </label>
              </div>
            </div>

            <div
              style={{
                padding: 14,
                borderTop: "1px solid #eee",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button type="button" onClick={closeAddModal} 
                style={{ padding: "8px 12px", borderRadius: "10px" }}
              >
                取消
              </button>
              <button type="submit" 
                style={{ padding: "8px 12px", borderRadius: "10px" }}
              >
                新增
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="admin-lot-tip-div">
        提示：主網址後方加上<code>?admin=1</code>為管理後台。可使用搜尋功能。
      </div>
    </div>
  );
}


