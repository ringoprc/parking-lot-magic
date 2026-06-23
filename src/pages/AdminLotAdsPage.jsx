// frontend/src/pages/AdminLotAdsPage.jsx
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Spinner } from "reactstrap";
import "./AdminLotAdsPage.css";

const ASSET_SLOTS = [
  {
    key: "bottomSheetExample",
    title: "底部資訊卡範例圖",
    hint: "建議橫圖，寬大於高，顯示在 bottom sheet 的「範例」區塊。",
    acceptShape: "橫圖",
  },
  {
    key: "navigationSquare",
    title: "導航準備廣告圖",
    hint: "建議正方形，顯示在「正在準備導航」modal 中間。",
    acceptShape: "正方形",
  },
  {
    key: "coupon",
    title: "優惠券圖片",
    hint: "可為正方形或橫圖，之後可用於店家優惠券顯示。",
    acceptShape: "正方形 / 橫圖",
  },
];

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function normalizeAdSponsor(lot) {
  const adSponsor = lot?.adSponsor || {};

  return {
    storeName: adSponsor.storeName || "",
    storeAddress: adSponsor.storeAddress || "",
  };
}

export default function AdminLotAdsPage({ apiBase }) {
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem("adminKey") || "");

  const [lotSearch, setLotSearch] = useState("");
  const [allLots, setAllLots] = useState([]);
  const [loadingLots, setLoadingLots] = useState(false);

  const [selectedLot, setSelectedLot] = useState(null);
  const [assets, setAssets] = useState({});
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [adSponsorForm, setAdSponsorForm] = useState({
    storeName: "",
    storeAddress: "",
  });
  const [savingAdSponsor, setSavingAdSponsor] = useState(false);

  const [localFiles, setLocalFiles] = useState({});
  const [localPreviewUrls, setLocalPreviewUrls] = useState({});
  const [uploadingSlot, setUploadingSlot] = useState("");

  function persistAdminKey(v) {
    setAdminKey(v);
    localStorage.setItem("adminKey", v);
  }

  function headersAuth() {
    return { "x-admin-key": adminKey };
  }

  async function fetchAllLots() {
    if (!adminKey) return toast.error("請先輸入管理員密碼");

    setLoadingLots(true);
    try {
      const qs = new URLSearchParams({ pageSize: "10000", page: "1" });

      const res = await fetch(`${apiBase}/api/admin/lots?${qs.toString()}`, {
        headers: headersAuth(),
      });

      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "load lots failed");

      const rows = Array.isArray(data?.rows) ? data.rows : [];
      setAllLots(rows);

      if (selectedLot?._id) {
        const refreshedSelectedLot = rows.find(
          (row) => String(row._id) === String(selectedLot._id)
        );

        if (refreshedSelectedLot) {
          setSelectedLot(refreshedSelectedLot);
          setAdSponsorForm(normalizeAdSponsor(refreshedSelectedLot));
        }
      }
    } catch (e) {
      toast.error(String(e?.message || e));
    } finally {
      setLoadingLots(false);
    }
  }

  async function fetchAssets(lot) {
    if (!adminKey || !lot?._id) return;

    setLoadingAssets(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/lots/${lot._id}/ad-assets`, {
        headers: headersAuth(),
      });

      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "load ad assets failed");

      setAssets(data?.adAssets || {});

      if (data?.lot) {
        const nextLot = {
          ...lot,
          ...data.lot,
        };

        setSelectedLot(nextLot);
        setAdSponsorForm(normalizeAdSponsor(nextLot));

        setAllLots((prev) =>
          prev.map((row) =>
            String(row._id) === String(nextLot._id)
              ? { ...row, ...nextLot }
              : row
          )
        );
      }
    } catch (e) {
      toast.error(String(e?.message || e));
      setAssets({});
    } finally {
      setLoadingAssets(false);
    }
  }

  function onPickLot(lot) {
    setSelectedLot(lot);
    setAdSponsorForm(normalizeAdSponsor(lot));
    setAssets({});
    setLocalFiles({});
    setLocalPreviewUrls({});
    fetchAssets(lot);
  }

  function onSelectFile(slotKey, file) {
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      toast.error("請選擇圖片檔");
      return;
    }

    setLocalFiles((prev) => ({
      ...prev,
      [slotKey]: file,
    }));

    setLocalPreviewUrls((prev) => {
      if (prev[slotKey]) URL.revokeObjectURL(prev[slotKey]);

      return {
        ...prev,
        [slotKey]: URL.createObjectURL(file),
      };
    });
  }

  async function uploadSlot(slotKey) {
    if (!adminKey) return toast.error("請先輸入管理員密碼");
    if (!selectedLot?._id) return toast.error("請先選擇停車場");

    const file = localFiles[slotKey];
    if (!file) return toast.error("請先選擇圖片");

    setUploadingSlot(slotKey);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch(`${apiBase}/api/admin/lots/${selectedLot._id}/ad-assets/${slotKey}`, {
        method: "POST",
        headers: headersAuth(),
        body: formData,
      });

      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "upload failed");

      toast.success("已上傳圖片");

      setLocalFiles((prev) => {
        const next = { ...prev };
        delete next[slotKey];
        return next;
      });

      setLocalPreviewUrls((prev) => {
        if (prev[slotKey]) URL.revokeObjectURL(prev[slotKey]);
        const next = { ...prev };
        delete next[slotKey];
        return next;
      });

      await fetchAssets(selectedLot);
    } catch (e) {
      toast.error(String(e?.message || e));
    } finally {
      setUploadingSlot("");
    }
  }

  async function deleteSlot(slotKey) {
    if (!adminKey) return toast.error("請先輸入管理員密碼");
    if (!selectedLot?._id) return toast.error("請先選擇停車場");

    const ok = window.confirm("確定要刪除這張圖片嗎？");
    if (!ok) return;

    try {
      const res = await fetch(`${apiBase}/api/admin/lots/${selectedLot._id}/ad-assets/${slotKey}`, {
        method: "DELETE",
        headers: headersAuth(),
      });

      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "delete failed");

      toast.success("已刪除圖片");
      await fetchAssets(selectedLot);
    } catch (e) {
      toast.error(String(e?.message || e));
    }
  }

  async function saveAdSponsor() {
    if (!adminKey) return toast.error("請先輸入管理員密碼");
    if (!selectedLot?._id) return toast.error("請先選擇停車場");

    setSavingAdSponsor(true);

    try {
      const res = await fetch(`${apiBase}/api/admin/lots/${selectedLot._id}/ad-sponsor`, {
        method: "PATCH",
        headers: {
          ...headersAuth(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(adSponsorForm),
      });

      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "save ad sponsor failed");

      const nextLot = {
        ...selectedLot,
        ...(data?.lot || {}),
      };

      setSelectedLot(nextLot);
      setAdSponsorForm(normalizeAdSponsor(nextLot));

      setAllLots((prev) =>
        prev.map((row) =>
          String(row._id) === String(nextLot._id)
            ? { ...row, ...nextLot }
            : row
        )
      );

      toast.success("已更新廣告店家資訊");
    } catch (e) {
      toast.error(String(e?.message || e));
    } finally {
      setSavingAdSponsor(false);
    }
  }

  useEffect(() => {
    if (!adminKey) return;
    fetchAllLots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  useEffect(() => {
    return () => {
      Object.values(localPreviewUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [localPreviewUrls]);

  const visibleLots = useMemo(() => {
    const q = lotSearch.trim().toLowerCase();
    if (!q) return allLots;

    return allLots.filter((l) => {
      const s = `${l.lotId || ""} ${l.name || ""} ${l.addressZh || ""} ${l.district || ""} ${l.adSponsor?.storeName || ""} ${l.adSponsor?.storeAddress || ""}`.toLowerCase();
      return s.includes(q);
    });
  }, [allLots, lotSearch]);

  return (
    <div className="ala-outer">
      <div className="ala-topbar">
        <div className="ala-title">商家廣告圖片管理</div>

        <div className="ala-adminkey">
          <div className="ala-label">管理員密碼</div>
          <input
            type="text"
            spellCheck="false"
            className="ala-input"
            style={{ minWidth: 360 }}
            value={adminKey}
            onChange={(e) => persistAdminKey(e.target.value)}
            placeholder="admin key"
          />

          <button className="ala-btn" onClick={fetchAllLots}>
            重新載入
          </button>
        </div>
      </div>

      <div className="ala-cols">
        <div className="ala-col">
          <div className="ala-colhdr">
            <div className="ala-searchrow">
              <input
                className="ala-input"
                value={lotSearch}
                onChange={(e) => setLotSearch(e.target.value)}
                placeholder={`搜尋 ${visibleLots.length} 個停車場`}
              />
              <button className="ala-btn" onClick={fetchAllLots}>
                搜尋
              </button>
            </div>

            <div className="ala-hint">點選停車場 → 右側上傳廣告圖片</div>
          </div>

          <div className="ala-scroll">
            {loadingLots ? (
              <div className="ala-center">
                <Spinner className="ala-custom-spinner" size="sm" /> 正在載入
              </div>
            ) : (
              <div className="ala-list">
                {visibleLots.map((l) => {
                  const isSelected = selectedLot && String(selectedLot._id) === String(l._id);

                  return (
                    <button
                      key={l._id}
                      className={`ala-item ${isSelected ? "sel" : ""}`}
                      onClick={() => onPickLot(l)}
                    >
                      <div className="ala-item-main">
                        <div className="ala-item-title">{l.name || "(no name)"}</div>
                        <div className="ala-item-sub">
                          {l.lotId ? `lotId: ${l.lotId}` : ""}
                          {l.district ? ` · ${l.district}` : ""}
                        </div>
                        {l.adSponsor?.storeName ? (
                          <div className="ala-item-sub">
                            廣告店家：{l.adSponsor.storeName}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}

                {!visibleLots.length ? (
                  <div className="ala-empty">沒有符合的停車場</div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="ala-col ala-maincol">
          <div className="ala-colhdr">
            {selectedLot ? (
              <div className="ala-selected-head">
                <div className="ala-selected-lot-info">
                  <div className="ala-lotname">{selectedLot.name || "(no name)"}</div>
                  <div className="ala-lotsub">
                    {selectedLot.lotId ? `lotId: ${selectedLot.lotId}` : ""}
                    {selectedLot.district ? ` · ${selectedLot.district}` : ""}
                  </div>
                </div>

                <div className="ala-ad-sponsor-form">
                  <div className="ala-field">
                    <label>廣告店家名稱</label>
                    <input
                      className="ala-input ala-sponsor-input"
                      value={adSponsorForm.storeName}
                      onChange={(e) =>
                        setAdSponsorForm((prev) => ({
                          ...prev,
                          storeName: e.target.value,
                        }))
                      }
                      placeholder="例如：Times 咖啡"
                    />
                  </div>

                  <div className="ala-field">
                    <label>店家地址</label>
                    <input
                      className="ala-input ala-sponsor-input"
                      value={adSponsorForm.storeAddress}
                      onChange={(e) =>
                        setAdSponsorForm((prev) => ({
                          ...prev,
                          storeAddress: e.target.value,
                        }))
                      }
                      placeholder="例如：台北市中山區..."
                    />
                  </div>

                  <button
                    className="ala-btn primary ala-save-sponsor-btn"
                    disabled={savingAdSponsor}
                    onClick={saveAdSponsor}
                  >
                    {savingAdSponsor ? "儲存中..." : "儲存店家資訊"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="ala-empty small">請先選擇停車場</div>
            )}
          </div>

          <div className="ala-scroll">
            {!selectedLot ? null : loadingAssets ? (
              <div className="ala-center">
                <Spinner className="ala-custom-spinner" size="sm" /> 正在載入圖片
              </div>
            ) : (
              <div className="ala-asset-grid">
                {ASSET_SLOTS.map((slot) => {
                  const asset = assets?.[slot.key] || null;
                  const previewUrl = localPreviewUrls[slot.key] || asset?.url || "";
                  const hasLocalFile = !!localFiles[slot.key];
                  const isUploading = uploadingSlot === slot.key;

                  return (
                    <div key={slot.key} className="ala-asset-card">
                      <div className="ala-asset-head">
                        <div>
                          <div className="ala-asset-title">{slot.title}</div>
                          <div className="ala-asset-shape">建議：{slot.acceptShape}</div>
                        </div>
                      </div>

                      <div style={{ 
                          height: "calc(100% - 55px)",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between"
                        }}
                      >
                        <div className={`ala-preview ${slot.key === "navigationSquare" ? "square" : "wide"}`}>
                          {previewUrl ? (
                            <img src={previewUrl} alt={slot.title} />
                          ) : (
                            <div className="ala-preview-empty">尚未上傳</div>
                          )}
                        </div>

                        <div>
                          <div className="ala-asset-hint">{slot.hint}</div>

                          {asset?.uploadedAt ? (
                            <div className="ala-asset-meta">
                              最後上傳：{new Date(asset.uploadedAt).toLocaleString()}
                            </div>
                          ) : null}

                          <div className="ala-actions">
                            <label className="ala-filebtn">
                              選擇圖片
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => onSelectFile(slot.key, e.target.files?.[0])}
                              />
                            </label>

                            <button
                              className="ala-btn primary"
                              disabled={!hasLocalFile || isUploading}
                              onClick={() => uploadSlot(slot.key)}
                            >
                              {isUploading ? "上傳中..." : "上傳"}
                            </button>

                            <button
                              className="ala-btn danger"
                              disabled={!asset?.url && !asset?.object}
                              onClick={() => deleteSlot(slot.key)}
                            >
                              刪除
                            </button>
                          </div>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



