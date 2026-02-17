// frontend/src/pages/AdminLinkagePage.jsx
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Spinner } from "reactstrap";
import {
  DragDropContext,
  Droppable,
  Draggable,
} from "@hello-pangea/dnd";

import "./AdminLinkagePage.css";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function reorder(list, startIndex, endIndex) {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

export default function AdminLinkagePage({ apiBase }) {
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem("adminKey") || "");
  function persistAdminKey(v) {
    setAdminKey(v);
    localStorage.setItem("adminKey", v);
  }

  // ===== Left: groups + lots in selected group
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState("all");
  const [groupLots, setGroupLots] = useState([]);
  const [loadingGroupLots, setLoadingGroupLots] = useState(false);

  // ===== Middle: all lots + search
  const [lotSearch, setLotSearch] = useState("");
  const [allLots, setAllLots] = useState([]);
  const [loadingLots, setLoadingLots] = useState(false);

  // ===== Right: selected lot + devices
  const [selectedLot, setSelectedLot] = useState(null);
  const [lotDevices, setLotDevices] = useState([]);
  const [loadingLotDevices, setLoadingLotDevices] = useState(false);

  // device search + suggestions
  const [deviceQuery, setDeviceQuery] = useState("");
  const [deviceSuggestions, setDeviceSuggestions] = useState([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);

  // relink confirm modal
  const [relinkModal, setRelinkModal] = useState({
    open: false,
    deviceId: "",
    currentLotId: "",
    currentLotName: "",
  });

  function headersJson() {
    return {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    };
  }
  function headersAuth() {
    return { "x-admin-key": adminKey };
  }

  async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
  }

  async function fetchGroups() {
    if (!adminKey) return;
    const res = await fetch(`${apiBase}/api/admin/parking-lot-groups`, {
      headers: headersAuth(),
    });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data?.error || "load groups failed");
    setGroups(Array.isArray(data?.rows) ? data.rows : []);
  }

  async function fetchGroupLots(nextGroupId) {
    if (!adminKey) return;
    if (!nextGroupId || nextGroupId === "all") {
      setGroupLots([]);
      return;
    }

    setLoadingGroupLots(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/parking-lot-groups/${nextGroupId}/lots`, {
        headers: headersAuth(),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "load group lots failed");
      setGroupLots(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      toast.error(String(e?.message || e));
    } finally {
      setLoadingGroupLots(false);
    }
  }

  async function fetchAllLots() {
    if (!adminKey) return;
    setLoadingLots(true);
    try {
      // You can later swap this to your real endpoint.
      const qs = new URLSearchParams({ search: lotSearch.trim(), pageSize: "5000", page: "1" });
      const res = await fetch(`${apiBase}/api/admin/lots?${qs.toString()}`, {
        headers: headersAuth(),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "load lots failed");
      setAllLots(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      toast.error(String(e?.message || e));
    } finally {
      setLoadingLots(false);
    }
  }

  async function fetchLotDevices(lot) {
    if (!adminKey || !lot?._id) return;
    setLoadingLotDevices(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/lots/${lot._id}/devices`, {
        headers: headersAuth(),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "load lot devices failed");
      setLotDevices(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      toast.error(String(e?.message || e));
    } finally {
      setLoadingLotDevices(false);
    }
  }

  async function suggestDevices(q) {
    if (!adminKey) return;
    const query = q.trim();
    if (!query) {
      setDeviceSuggestions([]);
      return;
    }

    setLoadingSuggest(true);
    try {
      const qs = new URLSearchParams({ query });
      const res = await fetch(`${apiBase}/api/admin/devices/suggest?${qs.toString()}`, {
        headers: headersAuth(),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "suggest failed");
      setDeviceSuggestions(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      // don’t spam errors while typing if endpoint not ready
      setDeviceSuggestions([]);
    } finally {
      setLoadingSuggest(false);
    }
  }

  async function addLotToGroup(lot) {
    if (!adminKey) return;
    if (!groupId || groupId === "all") {
      toast.error("請先選擇一個群組");
      return;
    }
    if (!lot?._id) return;

    // optimistic: prevent duplicates
    if (groupLots.some((x) => String(x._id) === String(lot._id))) {
      toast("已存在於群組");
      return;
    }

    setGroupLots((prev) => [lot, ...prev]);

    try {
      const res = await fetch(`${apiBase}/api/admin/parking-lot-groups/${groupId}/lots/add`, {
        method: "POST",
        headers: headersJson(),
        body: JSON.stringify({ lotId: lot._id }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "add failed");
      toast.success("已加入群組");
    } catch (e) {
      toast.error(String(e?.message || e));
      // rollback
      setGroupLots((prev) => prev.filter((x) => String(x._id) !== String(lot._id)));
    }
  }

  async function removeLotFromGroup(lotId) {
    if (!adminKey || !lotId) return;
    if (!groupId || groupId === "all") return;

    const prev = groupLots;
    setGroupLots((p) => p.filter((x) => String(x._id) !== String(lotId)));

    try {
      const res = await fetch(`${apiBase}/api/admin/parking-lot-groups/${groupId}/lots/${lotId}`, {
        method: "DELETE",
        headers: headersAuth(),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "delete failed");
      toast.success("已移除");
    } catch (e) {
      toast.error(String(e?.message || e));
      setGroupLots(prev); // rollback
    }
  }

  async function persistGroupOrder(nextLots) {
    if (!adminKey) return;
    if (!groupId || groupId === "all") return;

    try {
      const res = await fetch(`${apiBase}/api/admin/parking-lot-groups/${groupId}/lots/reorder`, {
        method: "POST",
        headers: headersJson(),
        body: JSON.stringify({ lotIds: nextLots.map((x) => x._id) }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "reorder failed");
    } catch (e) {
      toast.error(String(e?.message || e));
      // if reorder fails, reload from server later
      fetchGroupLots(groupId);
    }
  }

  async function linkDeviceToLot(deviceId, force = false) {
    if (!adminKey) return;
    if (!selectedLot?._id) {
      toast.error("請先選擇停車場");
      return;
    }

    try {
      const res = await fetch(`${apiBase}/api/admin/lots/${selectedLot._id}/link-device`, {
        method: "POST",
        headers: headersJson(),
        body: JSON.stringify({ deviceId, force }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "link device failed");
      toast.success("已連結裝置");
      setDeviceQuery("");
      setDeviceSuggestions([]);
      fetchLotDevices(selectedLot);
    } catch (e) {
      toast.error(String(e?.message || e));
    }
  }

  async function unlinkDeviceFromLot(deviceId) {
    if (!adminKey) return;
    if (!selectedLot?._id) return;

    const prev = lotDevices;
    setLotDevices((p) => p.filter((d) => d.deviceId !== deviceId));

    try {
      const res = await fetch(`${apiBase}/api/admin/lots/${selectedLot._id}/devices/${encodeURIComponent(deviceId)}`, {
        method: "DELETE",
        headers: headersAuth(),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "unlink failed");
      toast.success("已移除裝置");
    } catch (e) {
      toast.error(String(e?.message || e));
      setLotDevices(prev);
    }
  }

  // ===== Initial loads
  useEffect(() => {
    if (!adminKey) return;
    fetchGroups().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  useEffect(() => {
    if (!adminKey) return;
    fetchGroupLots(groupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, groupId]);

  // lots search (debounced)
  useEffect(() => {
    if (!adminKey) return;
    const t = setTimeout(() => {
      fetchAllLots();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, lotSearch]);

  // device suggestions (debounced)
  useEffect(() => {
    if (!adminKey) return;
    const t = setTimeout(() => suggestDevices(deviceQuery), 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, deviceQuery]);

  // derived
  const groupLotIdSet = useMemo(() => new Set(groupLots.map((x) => String(x._id))), [groupLots]);

  const visibleLots = useMemo(() => {
    const q = lotSearch.trim().toLowerCase();
    if (!q) return allLots;

    // backend likely already filters; this is fallback
    return allLots.filter((l) => {
      const s = `${l.lotId || ""} ${l.name || ""} ${l.addressZh || ""} ${l.district || ""}`.toLowerCase();
      return s.includes(q);
    });
  }, [allLots, lotSearch]);

  function onPickLot(lot) {
    setSelectedLot(lot);
    setLotDevices([]);
    setDeviceQuery("");
    setDeviceSuggestions([]);
    fetchLotDevices(lot);
  }

  function onDragEnd(result) {
    const { source, destination } = result;
    if (!destination) return;

    // reorder inside group list
    if (source.droppableId === "groupLots" && destination.droppableId === "groupLots") {
      const next = reorder(groupLots, source.index, destination.index);
      setGroupLots(next);
      persistGroupOrder(next);
      return;
    }

    // drag from allLots -> groupLots (add)
    if (source.droppableId === "allLots" && destination.droppableId === "groupLots") {
      const lot = visibleLots[source.index];
      if (!lot) return;
      addLotToGroup(lot);
      return;
    }
  }

  return (
    <div className="al-outer">
      {/* Top admin key bar */}
      <div className="al-topbar">
        <div className="al-title">停車場群組與裝置管理</div>

        <div className="al-adminkey">
          <div className="al-label">管理員密碼</div>
          <input
            className="al-input"
            style={{ minWidth: 360 }}
            value={adminKey}
            onChange={(e) => persistAdminKey(e.target.value)}
            placeholder="admin key"
          />
          <button
            className="al-btn"
            onClick={async() => {
              if (!adminKey) return toast.error("請先輸入管理員密碼");
              fetchGroups().catch(() => {});
              fetchGroupLots(groupId);
              await fetchAllLots();
              if (selectedLot) fetchLotDevices(selectedLot);
              toast.success("已重新載入");
            }}
          >
            重新載入
          </button>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="al-cols">
          {/* ============ LEFT: group lots ============ */}
          <div className="al-col">
            <div className="al-colhdr">
              <div className="al-select-div">
                <select
                  className="al-select"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                >
                  <option value="all">選擇群組…</option>
                  {groups.map((g) => (
                    <option key={g._id} value={g._id}>
                      {g.name || String(g._id)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="al-hint">拖曳中間停車場到這裡加入群組</div>
            </div>

            <div className="al-scroll">
              {loadingGroupLots ? (
                <div className="al-center">
                  <Spinner className="al-custom-spinner" size="sm" /> 正在載入
                </div>
              ) : (
                <Droppable droppableId="groupLots">
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="al-list"
                    >
                      {groupLots.map((l, idx) => (
                        <Draggable key={l._id} draggableId={`g-${l._id}`} index={idx}>
                          {(p) => (
                            <div
                              ref={p.innerRef}
                              {...p.draggableProps}
                              {...p.dragHandleProps}
                              className="al-item"
                            >
                              <div className="al-item-main">
                                <div className="al-item-title">
                                  {l.name || "(no name)"}
                                </div>
                                <div className="al-item-sub">
                                  {l.lotId ? `lotId: ${l.lotId}` : ""}{l.district ? ` · ${l.district}` : ""}
                                </div>
                              </div>

                              <button
                                className="al-xbtn"
                                title="移除"
                                onClick={() => removeLotFromGroup(l._id)}
                              >
                                ×
                              </button>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {!groupLots.length ? (
                        <div className="al-empty">此群組目前沒有停車場</div>
                      ) : null}
                    </div>
                  )}
                </Droppable>
              )}
            </div>
          </div>

          {/* ============ MIDDLE: all lots ============ */}
          <div className="al-col">
            <div className="al-colhdr">
              <div className="al-searchrow">
                <input
                  className="al-input"
                  value={lotSearch}
                  onChange={(e) => setLotSearch(e.target.value)}
                  placeholder={`搜尋 ${visibleLots.length} 個停車場（lotId / name / address / district）`}
                />
                <button className="al-btn" onClick={fetchAllLots}>
                  搜尋
                </button>
              </div>
              <div className="al-hint">點選停車場 → 右側管理裝置</div>
            </div>

            <div className="al-scroll">
              {loadingLots ? (
                <div className="al-center"><Spinner size="sm" /> Loading…</div>
              ) : (
                <Droppable droppableId="allLots">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="al-list">
                      {visibleLots.map((l, idx) => {
                        const inGroup = groupLotIdSet.has(String(l._id));
                        const isSelected = selectedLot && String(selectedLot._id) === String(l._id);
                        return (
                          <Draggable key={l._id} draggableId={`a-${l._id}`} index={idx}>
                            {(p) => (
                              <div
                                ref={p.innerRef}
                                {...p.draggableProps}
                                {...p.dragHandleProps}
                                className={`al-item ${isSelected ? "sel" : ""}`}
                                onClick={() => onPickLot(l)}
                              >
                                <div className="al-item-main">
                                  <div className="al-item-title">
                                    {l.name || "(no name)"}
                                  </div>
                                  <div className="al-item-sub">
                                    {l.lotId ? `lotId: ${l.lotId}` : ""}{l.district ? ` · ${l.district}` : ""}
                                  </div>
                                </div>

                                {inGroup ? <div className="al-badge">in group</div> : null}
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                      {!visibleLots.length ? (
                        <div className="al-empty">沒有符合的停車場</div>
                      ) : null}
                    </div>
                  )}
                </Droppable>
              )}
            </div>
          </div>

          {/* ============ RIGHT: selected lot devices ============ */}
          <div className="al-col">
            <div className="al-colhdr">
              {selectedLot ? (
                <>
                  <div className="al-lothead">
                    <div className="al-lotname">{selectedLot.name || "(no name)"}</div>
                    <div className="al-lotsub">
                      {selectedLot.lotId ? `lotId: ${selectedLot.lotId}` : ""}{selectedLot.district ? ` · ${selectedLot.district}` : ""}
                    </div>
                  </div>

                  <div className="al-searchrow" style={{ marginTop: 10 }}>
                    <input
                      className="al-input"
                      value={deviceQuery}
                      onChange={(e) => setDeviceQuery(e.target.value)}
                      placeholder="輸入裝置 deviceId（部分字串）"
                    />
                  </div>

                  {loadingSuggest ? (
                    <div className="al-suggest al-center"><Spinner size="sm" /> Searching…</div>
                  ) : deviceSuggestions.length ? (
                    <div className="al-suggest">
                      {deviceSuggestions.slice(0, 10).map((d) => (
                        <button
                          key={d.deviceId}
                          className="al-suggest-item"
                          onClick={() => {
                            const cur = d.parkingLotId;
                            if (cur && String(cur) !== String(selectedLot._id)) {
                              setRelinkModal({
                                open: true,
                                deviceId: d.deviceId,
                                currentLotId: String(cur),
                                currentLotName: d.currentLotName || "",
                              });
                              return;
                            }
                            linkDeviceToLot(d.deviceId, false);
                          }}
                        >
                          <div className="al-suggest-id">{d.deviceId}</div>
                          {d.parkingLotId ? (
                            <div className="al-suggest-sub">linked: {String(d.parkingLotId).slice(0, 6)}…</div>
                          ) : (
                            <div className="al-suggest-sub">not linked</div>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="al-empty">請先在中間點選一個停車場</div>
              )}
            </div>

            <div className="al-scroll">
              {!selectedLot ? null : loadingLotDevices ? (
                <div className="al-center"><Spinner size="sm" /> Loading…</div>
              ) : (
                <div className="al-list">
                  {lotDevices.map((d) => (
                    <div key={d.deviceId} className="al-item">
                      <div className="al-item-main">
                        <div className="al-item-title">{d.deviceId}</div>
                        <div className="al-item-sub">
                          {d.status ? `status: ${d.status}` : ""}
                        </div>
                      </div>
                      <button className="al-xbtn" title="移除" onClick={() => unlinkDeviceFromLot(d.deviceId)}>
                        ×
                      </button>
                    </div>
                  ))}

                  {!lotDevices.length ? (
                    <div className="al-empty">此停車場目前沒有連結裝置</div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </DragDropContext>

      {/* Relink confirm modal */}
      {relinkModal.open ? (
        <div className="al-modal-backdrop" onMouseDown={() => setRelinkModal({ open: false, deviceId: "", currentLotId: "", currentLotName: "" })}>
          <div className="al-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="al-modal-title">裝置已連結到其他停車場</div>
            <div className="al-modal-body">
              <div>deviceId: <b>{relinkModal.deviceId}</b></div>
              <div style={{ marginTop: 8 }}>
                你要把它改連結到目前選擇的停車場嗎？
              </div>
            </div>
            <div className="al-modal-actions">
              <button className="al-btn" onClick={() => setRelinkModal({ open: false, deviceId: "", currentLotId: "", currentLotName: "" })}>
                取消
              </button>
              <button
                className="al-btn danger"
                onClick={() => {
                  const deviceId = relinkModal.deviceId;
                  setRelinkModal({ open: false, deviceId: "", currentLotId: "", currentLotName: "" });
                  linkDeviceToLot(deviceId, true);
                }}
              >
                重新連結
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}



