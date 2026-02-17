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


  //--------------------------------------------
  // States
  //--------------------------------------------

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
  const [deviceSuggestionsLoaded, setDeviceSuggestionsLoaded] = useState(false);

  //--------------------------------------------
  // Modals
  //--------------------------------------------
  // create group modal
  const [createGroupModal, setCreateGroupModal] = useState({
    open: false,
    name: "",
  });

  // delete group modal
  const [deleteGroupModal, setDeleteGroupModal] = useState({
    open: false,
  });

  // relink confirm modal
  const [relinkModal, setRelinkModal] = useState({
    open: false,
    deviceId: "",
    currentLotId: "",
    currentLotName: "",
  });

  // unlink confirm modal
  const [unlinkModal, setUnlinkModal] = useState({
    open: false,
    deviceId: "",
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
      const qs = new URLSearchParams({ pageSize: "10000", page: "1" });
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
    setDeviceSuggestionsLoaded(false);

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
      setDeviceSuggestionsLoaded(true);
    }
  }


  //--------------------------------------------
  // Add and Delete Lot Groups
  //--------------------------------------------

  async function createGroup(name) {
    if (!adminKey) return;
    const n = String(name ?? "").trim();
    if (!n) return toast.error("請輸入群組名稱");

    try {
      const res = await fetch(`${apiBase}/api/admin/parking-lot-groups`, {
        method: "POST",
        headers: headersJson(),
        body: JSON.stringify({ name: n }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "create group failed");

      toast.success("已新增群組");
      await fetchGroups();               // refresh list
      const newId = data?.row?._id;
      if (newId) setGroupId(String(newId)); // auto-select new group
      setCreateGroupModal({ open: false, name: "" });
    } catch (e) {
      toast.error(String(e?.message || e));
    }
  }

  async function deleteGroup() {
    if (!adminKey) return;
    if (!groupId || groupId === "all") return toast.error("請先選擇一個群組");

    try {
      const res = await fetch(`${apiBase}/api/admin/parking-lot-groups/${groupId}`, {
        method: "DELETE",
        headers: headersAuth(),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "delete group failed");

      toast.success("已刪除群組");

      // reset left
      setGroupId("all");
      setGroupLots([]);

      // reset right (so you don’t keep editing devices for a stale context)
      setSelectedLot(null);
      setLotDevices([]);
      setLoadingLotDevices(false);

      setDeviceQuery("");
      setDeviceSuggestions([]);
      setLoadingSuggest(false);

      setRelinkModal({ open: false, deviceId: "", currentLotId: "", currentLotName: "" });
      setUnlinkModal({ open: false, deviceId: "" });

      await fetchGroups();
      setDeleteGroupModal({ open: false });
    } catch (e) {
      toast.error(String(e?.message || e));
    }
  }


  //--------------------------------------------
  // Add and Delete Lots in Groups
  //--------------------------------------------
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


  //--------------------------------------------
  // Link and Unlink Device 
  //--------------------------------------------

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
      fetchAllLots();
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


  function onPickLot(lot) {
    setSelectedLot(lot);
    setLotDevices([]);
    setDeviceQuery("");
    setDeviceSuggestions([]);
    setDeviceSuggestionsLoaded(false);
    fetchLotDevices(lot);
    suggestDevices(deviceQuery);
  }

  function onDragEnd(result) {
    const { source, destination } = result;
    if (!destination) return;

    // Drag from allLots -> groupLots (add to group)
    if (source.droppableId === "allLots" && destination.droppableId === "groupLots") {
      const lot = visibleLots[source.index];
      if (!lot) return;
      addLotToGroup(lot);
      return;
    }

    // Reorder inside group list
    if (source.droppableId === "groupLots" && destination.droppableId === "groupLots") {
      const next = reorder(groupLots, source.index, destination.index);
      setGroupLots(next);
      persistGroupOrder(next);
      return;
    }

  }


  //----------------------------------------
  // Initial loads
  //----------------------------------------
  // Fetch Groups
  useEffect(() => {
    if (!adminKey) return;
    fetchGroups().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  // Fetch Lots in Groups
  useEffect(() => {
    if (!adminKey) return;
    fetchGroupLots(groupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, groupId]);

  // Fetch All Lots
  useEffect(() => {
    if (!adminKey) return;
    fetchAllLots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);


  //------------------------------------------
  // Debounced device suggestions
  //------------------------------------------

  useEffect(() => {
    if (!adminKey) return;
    const t = setTimeout(() => suggestDevices(deviceQuery), 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, deviceQuery]);

  const filteredDeviceSuggestions = useMemo(() => {
    if (!selectedLot?._id) return deviceSuggestions;

    return deviceSuggestions.filter(
      (d) => !(d.parkingLotId._id && String(d.parkingLotId._id) === String(selectedLot._id))
    );
  }, [deviceSuggestions, selectedLot?._id]);


  //---------------------------------------------
  // Derived
  //---------------------------------------------

  const groupLotIdSet = useMemo(() => 
    new Set(groupLots.map((x) => String(x._id)))
  , [groupLots]);

  const visibleLots = useMemo(() => {
    const q = lotSearch.trim().toLowerCase();
    if (!q) return allLots;

    // backend likely already filters; this is fallback
    return allLots.filter((l) => {
      const s = `${l.lotId || ""} ${l.name || ""} ${l.addressZh || ""} ${l.district || ""}`.toLowerCase();
      return s.includes(q);
    });
  }, [allLots, lotSearch]);

  

  //---------------------------------------------
  // Return
  //---------------------------------------------
  return (
    <div className="al-outer">
      {/* Top admin key bar */}
      <div className="al-topbar">
        <div className="al-title">停車場群組與裝置管理</div>

        <div className="al-adminkey">
          <div className="al-label">管理員密碼</div>
          <input
            type="text"
            spellcheck="false"
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

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "30px"
                }}
              >
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

                <div
                  style={{
                    display: "flex",
                    gap: "4px"
                  }}
                >
                  <button
                    className="al-btn"
                    onClick={() => setCreateGroupModal({ open: true, name: "" })}
                    title="新增群組"
                  >
                    新增
                  </button>

                  <button
                    className="al-btn danger"
                    disabled={!groupId || groupId === "all"}
                    onClick={() => setDeleteGroupModal({ open: true })}
                    title="刪除此群組"
                  >
                    刪除
                  </button>
                </div>
              </div>

              <div className="al-hint">
                <span>拖曳中間停車場到這裡加入群組</span>
                <span>・{groupLots.length} 個停車場</span>
              </div>
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
                              className={`al-item ${selectedLot && String(selectedLot._id) === String(l._id) ? "sel" : ""}`}
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

                              <button
                                className="al-xbtn"
                                title="移除"
                                onClick={() => {
                                  e.stopPropagation();
                                  removeLotFromGroup(l._id)
                                }}
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
                <div className="al-center">
                  <Spinner className="al-custom-spinner" size="sm" /> 正在載入
                </div>
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

                                {inGroup ? <div className="al-badge">群組</div> : null}

                                <div>
                                  <span className={"al-item-device-count " + (l?.deviceCount > 0 ? "has-device" : " ")}>
                                    {`${Number.isFinite(Number(l.deviceCount)) ? l.deviceCount : 0}`}
                                  </span>
                                </div>
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
                      onFocus={() => {
                        suggestDevices("");
                      }}
                      onChange={(e) => setDeviceQuery(e.target.value)}
                      placeholder="輸入裝置 deviceId（部分字串）"
                    />
                  </div>

                  {(deviceSuggestionsLoaded || loadingSuggest) && (
                    <>
                      <div className="al-suggest-title-label-div">
                        <p className="mb-0">可選擇的裝置列表 ({filteredDeviceSuggestions?.length || 0})</p>
                      </div>
                   
                      <div className="al-suggest">
                        {filteredDeviceSuggestions.length ? (
                          <div>
                            {filteredDeviceSuggestions.slice(0, 10).map((d) => (
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
                                  <div className="al-suggest-sub">已連結到：{String(d.currentLotName)}</div>
                                ) : (
                                  <div className="al-suggest-sub">not linked</div>
                                )}
                              </button>
                            ))}
                          </div>
                        ) : (
                          !loadingSuggest ? (
                            <div className="al-suggest-loading">
                              <Spinner className="al-custom-spinner" size="sm" /> 正在載入
                            </div>
                          ) : 
                            <div className="al-empty">沒有可新增的裝置</div>
                          )}
                      </div>
                    </>
                  )}

                </>

              ) : (
                <div className="al-empty">請先選擇停車場</div>
              )}
            </div>

            <div className="al-scroll">
              {!selectedLot ? null : (loadingLotDevices && false) ? (
                <div className="al-center">
                  <Spinner className="al-custom-spinner" size="sm" /> 正在載入
                </div>
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
                      <button
                        className="al-xbtn"
                        title="移除"
                        onClick={() => setUnlinkModal({ open: true, deviceId: d.deviceId })}
                      >
                        -
                      </button>
                    </div>
                  ))}

                  {!lotDevices.length ? (
                    <div className="al-empty">此停車場目前沒有已連結的裝置</div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </DragDropContext>

      {/* Create group modal */}
      {createGroupModal.open ? (
        <div
          className="al-modal-backdrop"
          onMouseDown={() => setCreateGroupModal({ open: false, name: "" })}
        >
          <div className="al-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="al-modal-title">新增群組</div>
            <div className="al-modal-body">
              <div className="al-label" style={{ marginBottom: 6 }}>群組名稱</div>
              <div className="al-new-group-name-input-div">
                <input
                  className="al-input"
                  value={createGroupModal.name}
                  onChange={(e) => setCreateGroupModal((p) => ({ ...p, name: e.target.value }))}
                  placeholder="例如：中山區 A 組"
                  autoFocus
                />
              </div>
            </div>
            <div className="al-modal-actions">
              <button className="al-btn" onClick={() => setCreateGroupModal({ open: false, name: "" })}>
                取消
              </button>
              <button className="al-btn danger" onClick={() => createGroup(createGroupModal.name)}>
                建立
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete group modal */}
      {deleteGroupModal.open ? (
        <div
          className="al-modal-backdrop"
          onMouseDown={() => setDeleteGroupModal({ open: false })}
        >
          <div className="al-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="al-modal-title">確認刪除群組</div>
            <div className="al-modal-body">
              <div>
                確定要刪除群組 [
                <b>{groups.find((g) => String(g._id) === String(groupId))?.name || ""}</b>] 嗎？
              </div>
              <div style={{ marginTop: 8, opacity: 0.8 }}>
                群組內的停車場不會被刪除，但會被移出群組。
              </div>
            </div>
            <div className="al-modal-actions">
              <button className="al-btn" onClick={() => setDeleteGroupModal({ open: false })}>
                取消
              </button>
              <button
                className="al-btn danger"
                onClick={() => {
                  setDeleteGroupModal({ open: false });
                  deleteGroup();
                }}
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Unlink confirm modal */}
      {unlinkModal.open ? (
        <div
          className="al-modal-backdrop"
          onMouseDown={() => setUnlinkModal({ open: false, deviceId: "" })}
        >
          <div className="al-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="al-modal-title">確認移除裝置連結</div>
            <div className="al-modal-body">
              <div>
                你確定要移除裝置 <b>{unlinkModal.deviceId}</b> 的連結嗎？
              </div>
            </div>
            <div className="al-modal-actions">
              <button
                className="al-btn"
                onClick={() => setUnlinkModal({ open: false, deviceId: "" })}
              >
                取消
              </button>
              <button
                className="al-btn danger"
                onClick={() => {
                  const deviceId = unlinkModal.deviceId;
                  setUnlinkModal({ open: false, deviceId: "" });
                  unlinkDeviceFromLot(deviceId);
                }}
              >
                確認移除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Relink confirm modal */}
      {relinkModal.open ? (
        <div className="al-modal-backdrop" onMouseDown={() => setRelinkModal({ open: false, deviceId: "", currentLotId: "", currentLotName: "" })}>
          <div className="al-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="al-modal-title">
              裝置已連結到 {relinkModal.currentLotName ? `[${relinkModal.currentLotName}]` : "其他停車場"}
            </div>
            <div className="al-modal-body">
              <div>deviceId: <b>{relinkModal.deviceId}</b></div>
              <div style={{ marginTop: 8 }}>
                要改為連結到 [{selectedLot.name}] 嗎？
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
                改為連結到此停車場
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}



