// frontend/src/pages/AdminDeviceLinkModal.jsx
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "reactstrap";

export default function AdminDeviceLinkModal({
  isOpen,
  device,
  apiBase,
  adminKey,
  onClose,
  onSaved,
}) {
  const [lotSearchText, setLotSearchText] = useState("");
  const [lotSuggestions, setLotSuggestions] = useState([]);
  const [lotSuggestionsLoading, setLotSuggestionsLoading] = useState(false);
  const [lotSuggestionsOpen, setLotSuggestionsOpen] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState("");

  const [linkSaving, setLinkSaving] = useState(false);

  const lotSearchContainerRef = useRef(null);
  const lotSuggestTimerRef = useRef(null);
  const skipNextLotSuggestRef = useRef(false);

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

  function resetLocalState() {
    setLotSearchText("");
    setLotSuggestions([]);
    setLotSuggestionsOpen(false);
    setSelectedLotId("");

    if (lotSuggestTimerRef.current) {
      clearTimeout(lotSuggestTimerRef.current);
      lotSuggestTimerRef.current = null;
    }
  }

  function handleClose() {
    resetLocalState();
    onClose?.();
  }

  async function saveDeviceLotLink() {
    if (!adminKey) return;
    if (!device?.deviceId) return;

    if (!selectedLotId) {
      toast.error("請先選擇停車場");
      return;
    }

    setLinkSaving(true);
    try {
      const res = await fetch(
        `${apiBase}/api/admin/devices/${encodeURIComponent(device.deviceId)}/link-lot`,
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
      handleClose();
      await onSaved?.();
    } catch (e) {
      toast.error(e?.message || "裝置連結停車場失敗");
    } finally {
      setLinkSaving(false);
    }
  }

  async function unlinkDeviceFromLot() {
    if (!adminKey) return;
    if (!device?.deviceId) return;

    setLinkSaving(true);
    try {
      const currentLotId = device?.lot?._id || device?.phone?.parkingLotId || "";

      if (!currentLotId) {
        toast.success("此裝置目前未連結停車場");
        handleClose();
        await onSaved?.();
        return;
      }

      const res = await fetch(
        `${apiBase}/api/admin/lots/${encodeURIComponent(currentLotId)}/devices/${encodeURIComponent(device.deviceId)}`,
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
      handleClose();
      await onSaved?.();
    } catch (e) {
      toast.error(e?.message || "取消連結失敗");
    } finally {
      setLinkSaving(false);
    }
  }

  useEffect(() => {
    if (!isOpen || !device) return;

    const currentLotId = device?.lot?._id ? String(device.lot._id) : "";
    const currentLotName = device?.lot?.name ? String(device.lot.name) : "";

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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, device?.deviceId]);

  useEffect(() => {
    if (!isOpen) return;

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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotSearchText, isOpen, selectedLotId]);

  useEffect(() => {
    if (!isOpen) return;

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
  }, [isOpen]);

  const chosen = selectedLotId
    ? lotSuggestions.find((lot) => String(lot._id) === String(selectedLotId)) ||
      (device?.lot && String(device.lot._id) === String(selectedLotId) ? device.lot : null)
    : null;

  return (
    <Modal isOpen={isOpen} toggle={handleClose} centered>
      <ModalHeader toggle={handleClose}>設定裝置停車場連結</ModalHeader>

      <ModalBody style={{ minHeight: "65vh" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>裝置 ID</div>
            <div style={{ fontWeight: 700, fontSize: "12px" }}>{device?.deviceId || "-"}</div>
          </div>

          <div>
            <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>目前停車場</div>
            <div style={{ fontWeight: 700, fontSize: "12px" }}>{device?.lot?.name || "尚未連結"}</div>
          </div>

          <div ref={lotSearchContainerRef} style={{ position: "relative" }}>
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

          {chosen ? (
            <div style={{ fontSize: "12px", color: "#555", lineHeight: 1.5 }}>
              <div>lotId：{chosen.lotId || "-"}</div>
              <div>名稱：{chosen.name || "-"}</div>
              <div>行政區：{chosen.district || "-"}</div>
              <div>地址：{chosen.addressZh || "-"}</div>
            </div>
          ) : null}
        </div>
      </ModalBody>

      <ModalFooter>
        <button
          type="button"
          className="admin-dev-btn"
          onClick={handleClose}
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
  );
}

