// frontend/src/pages/AdminLotsPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { FiTrash2 } from "react-icons/fi";
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
    if (!adminKey) return;
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
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "load failed");

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
      alert("lotId and name are required");
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
      alert(data?.error || "create failed");
      return;
    }

    closeAddModal();
    await load();
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
      alert(data?.error || "save failed");
      return;
    }
    await load();
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
    if (!res.ok) return alert(data?.error || "delete failed");
    await load();
  }

  const totalPages = Math.max(1, Math.ceil((meta.total || 0) / PAGE_SIZE));

  function tsvCell(v) {
    if (v == null) return "";
    // prevent breaking TSV rows if user has tabs/newlines in text
    return String(v).replace(/\t/g, " ").replace(/\r?\n/g, " ");
  }

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

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        height: "100vh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div className="admin-lot-action-outer-row"
        style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}
      >

        <div className="admin-lot-password-row">
          <div style={{ fontWeight: 700 }}>管理停車場資訊</div>
          <div
            style={{
              display: "flex",
              flex: "1 1 0%",
              alignItems: "center",
              margin: "0px 10px 0px 10px",
              padding: "0px 10px 0px 10px",
              borderLeft: "1px solid #ccc",
              borderRight: "1px solid #ccc"
            }}
          >
            <p className="mb-0">管理員密碼：</p>
            <input
              placeholder="Admin key (saved in localStorage)"
              value={adminKey}
              onChange={(e) => {
                setAdminKey(e.target.value);
                localStorage.setItem("adminKey", e.target.value);
              }}
              style={{ flex: 1, padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8 }}
            />
          </div>
        </div>

        <div className="admin-lot-action-row">
          <button className="admin-lot-action-btn"
            onClick={load}
          >
            Reload
          </button>
          <button 
            className={`admin-lot-action-btn ` 
              + (dirtyIds.size>0 ? "should-save ": " ")
            }
            onClick={saveAll} 
            disabled={!dirtyIds.size} 
          >
            Save ({dirtyIds.size})
          </button>
          <button className="admin-lot-action-btn"
            onClick={addRow} 
          >
            + Add
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <select value={district} onChange={(e) => setDistrict(e.target.value)} style={{ padding: "8px 10px" }}>
          <option value="all">所有區域</option>
          <option value="大同區">大同區</option>
          <option value="中山區">中山區</option>
          {/* add more as needed */}
        </select>

        <input
          placeholder="search (lotId/name/address/note)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(1);
              load();
            }
          }}
          style={{ flex: 1, padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8 }}
        />

        <button onClick={() => { setPage(1); load(); }} style={{ padding: "8px 10px" }}>
          Search
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>‹</button>
          <div>{page} / {totalPages}</div>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>›</button>
        </div>
      </div>

      {loading && <div style={{ padding: 8 }}>Loading...</div>}

      <div
        style={{
          flex: 1,
          overflow: "auto",
          border: "1px solid #e6e6e6",
          borderTop: "none",
          borderLeft: "1px solid #c3c2c3",
          borderRight: "3px solid #c3c2c3",
          scrollbarWidth: "thin"
        }}
      >
        <table style={{ borderCollapse: "collapse", width: "max-content", minWidth: "100%" }}>

          <thead style={{ position: "sticky", 
            top: "-1px", background: "#f7f7f7", zIndex: "30", 
            borderBottom: "1px solid #666",
          }}>
            <tr>
              {[
                "複製","lotId","name","addressZh","district","lat","lng","空位數",
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

      <div style={{ marginTop: 10, color: "#666", flex: "0 0 auto" }}>
        Tip: open <code>?admin=1</code> to access this page. Press Enter in search box to run search.
      </div>
    </div>
  );
}


