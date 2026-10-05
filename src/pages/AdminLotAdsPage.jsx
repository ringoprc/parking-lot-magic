// frontend/src/pages/AdminLotAdsPage.jsx
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Spinner } from "reactstrap";
import "./AdminLotAdsPage.css";

import { MdOutlineArrowBackIos } from "react-icons/md";

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
  {
    key: "entrancePhoto",
    title: "停車場入口照片",
    hint: "建議橫圖，顯示在地圖資訊視窗與底部資訊卡中，商家廣告左側。未上傳時顯示預設圖片。",
    acceptShape: "橫圖",
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
    distanceToLotM: adSponsor.distanceToLotM ?? "",
    walkMinutes: adSponsor.walkMinutes ?? "",
  };
}

function hasTextValue(v) {
  return typeof v === "string" ? v.trim().length > 0 : !!v;
}

function hasLotAdAsset(lot, slotKey) {
  const asset = lot?.adAssets?.[slotKey];

  if (!asset) return false;
  if (typeof asset === "string") return asset.trim().length > 0;

  return !!(
    asset.url ||
    asset.object ||
    asset.gcsObject ||
    asset.path ||
    asset.uploadedAt
  );
}

export default function AdminLotAdsPage({ apiBase }) {
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem("adminKey") || "");

  const [lotSearch, setLotSearch] = useState("");
  const [lotFilters, setLotFilters] = useState({
    hasStoreAddress: false,
    hasBottomSheetExample: false,
    hasNavigationSquare: false,
    hasEntrancePhoto: false,
  });
  const [allLots, setAllLots] = useState([]);
  const [loadingLots, setLoadingLots] = useState(false);

  const [selectedLot, setSelectedLot] = useState(null);
  const [assets, setAssets] = useState({});
  const [loadingAssets, setLoadingAssets] = useState(false);
  const assetsRequestRef = useRef(0);
  const [adSponsorForm, setAdSponsorForm] = useState({
    storeName: "",
    storeAddress: "",
    distanceToLotM: "",
    walkMinutes: "",
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

  function toggleLotFilter(key) {
    setLotFilters((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
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

    const requestId = ++assetsRequestRef.current;
    setLoadingAssets(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/lots/${lot._id}/ad-assets`, {
        headers: headersAuth(),
      });

      const data = await safeJson(res);
      // Rapid keyboard selection must not let an older response restore a lot.
      if (requestId !== assetsRequestRef.current) return;
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
      if (requestId !== assetsRequestRef.current) return;
      toast.error(String(e?.message || e));
      setAssets({});
    } finally {
      if (requestId === assetsRequestRef.current) setLoadingAssets(false);
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

      const payload = {
        storeName: adSponsorForm.storeName,
        storeAddress: adSponsorForm.storeAddress,
        distanceToLotM:
          adSponsorForm.distanceToLotM === ""
            ? null
            : Number(adSponsorForm.distanceToLotM),
        walkMinutes:
          adSponsorForm.walkMinutes === ""
            ? null
            : Number(adSponsorForm.walkMinutes),
      };

      const res = await fetch(`${apiBase}/api/admin/lots/${selectedLot._id}/ad-sponsor`, {
        method: "PATCH",
        headers: {
          ...headersAuth(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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

  async function clearAdSponsor() {
    if (!adminKey) return toast.error("請先輸入管理員密碼");
    if (!selectedLot?._id) return toast.error("請先選擇停車場");

    const ok = window.confirm("確定要清除這個停車場的廣告店家資訊嗎？");
    if (!ok) return;

    setSavingAdSponsor(true);

    try {
      const res = await fetch(`${apiBase}/api/admin/lots/${selectedLot._id}/ad-sponsor`, {
        method: "DELETE",
        headers: headersAuth(),
      });

      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "clear ad sponsor failed");

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

      toast.success("已清除廣告店家資訊");
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

    return allLots.filter((l) => {
      const s = `${l.lotId || ""} ${l.name || ""} ${l.addressZh || ""} ${l.district || ""} ${l.adSponsor?.storeName || ""} ${l.adSponsor?.storeAddress || ""}`.toLowerCase();

      if (q && !s.includes(q)) return false;

      if (
        lotFilters.hasStoreAddress &&
        !hasTextValue(l.adSponsor?.storeAddress)
      ) {
        return false;
      }

      if (
        lotFilters.hasBottomSheetExample &&
        !hasLotAdAsset(l, "bottomSheetExample")
      ) {
        return false;
      }

      if (
        lotFilters.hasNavigationSquare &&
        !hasLotAdAsset(l, "navigationSquare")
      ) {
        return false;
      }

      if (
        lotFilters.hasEntrancePhoto &&
        !hasLotAdAsset(l, "entrancePhoto")
      ) {
        return false;
      }

      return true;
    });
  }, [allLots, lotSearch, lotFilters]);

  function handleLotKeyDown(event, index) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const nextIndex = index + (event.key === "ArrowDown" ? 1 : -1);
    if (nextIndex < 0 || nextIndex >= visibleLots.length) return;
    const nextButton = event.currentTarget.parentElement.querySelectorAll(".ala-item")[nextIndex];
    nextButton?.focus({ preventScroll: true });
    nextButton?.scrollIntoView({ block: "nearest", inline: "nearest" });
    onPickLot(visibleLots[nextIndex]);
  }

  return (
    <div className="ala-outer">
      <div className="ala-topbar">

        <a className="ala-back-btn" href="/?admin=1" aria-label="回到管理選單">
          <MdOutlineArrowBackIos size={18} />
        </a>

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

            <div className="ala-hint">點選停車場 → 右側上傳入口照片或廣告圖片</div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                marginTop: 10,
                fontSize: 13,
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={lotFilters.hasStoreAddress}
                  onChange={() => toggleLotFilter("hasStoreAddress")}
                />
                僅顯示已有商家地址
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={lotFilters.hasBottomSheetExample}
                  onChange={() => toggleLotFilter("hasBottomSheetExample")}
                />
                僅顯示已有底部資訊卡圖片
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={lotFilters.hasNavigationSquare}
                  onChange={() => toggleLotFilter("hasNavigationSquare")}
                />
                僅顯示已有導航準備廣告圖
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={lotFilters.hasEntrancePhoto}
                  onChange={() => toggleLotFilter("hasEntrancePhoto")}
                />
                僅顯示已有停車場入口照片
              </label>
            </div>
          </div>

          <div className="ala-scroll">
            {loadingLots ? (
              <div className="ala-center">
                <Spinner className="ala-custom-spinner" size="sm" /> 正在載入
              </div>
            ) : (
              <div className="ala-list">
                <div className="ala-result-count" role="status">
                  共 {visibleLots.length.toLocaleString("zh-TW")} 筆結果
                </div>
                {visibleLots.map((l, index) => {
                  const isSelected = selectedLot && String(selectedLot._id) === String(l._id);

                  return (
                    <button
                      key={l._id}
                      className={`ala-item ${isSelected ? "sel" : ""}`}
                      onClick={() => onPickLot(l)}
                      onKeyDown={(event) => handleLotKeyDown(event, index)}
                      aria-pressed={!!isSelected}
                    >
                      <div className="ala-item-main">
                        <div className="ala-item-title" title={l.name || "(no name)"}>{l.name || "(no name)"}</div>
                        <div className="ala-item-sub" title={`${l.lotId ? `lotId: ${l.lotId}` : ""}${l.district ? ` · ${l.district}` : ""}`}>
                          {l.lotId ? `lotId: ${l.lotId}` : ""}
                          {l.district ? ` · ${l.district}` : ""}
                        </div>
                        {l.adSponsor?.storeName ? (
                          <div className="ala-item-sub" title={`廣告店家：${l.adSponsor.storeName}`}>
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
                  <div className="ala-lotname" title={selectedLot.name || "(no name)"}>{selectedLot.name || "(no name)"}</div>
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
                      title={adSponsorForm.storeName}
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
                      title={adSponsorForm.storeAddress}
                      onChange={(e) =>
                        setAdSponsorForm((prev) => ({
                          ...prev,
                          storeAddress: e.target.value,
                        }))
                      }
                      placeholder="例如：台北市中山區..."
                    />
                  </div>

                  <div className="ala-field">
                    <label>距離停車場（公尺）</label>
                    <input
                      className="ala-input ala-sponsor-input"
                      type="number"
                      min="0"
                      step="1"
                      value={adSponsorForm.distanceToLotM}
                      onChange={(e) =>
                        setAdSponsorForm((prev) => ({
                          ...prev,
                          distanceToLotM: e.target.value,
                        }))
                      }
                      placeholder="例如：120"
                    />
                  </div>

                  <div className="ala-field">
                    <label>步行時間（分鐘內）</label>
                    <input
                      className="ala-input ala-sponsor-input"
                      type="number"
                      min="0"
                      step="1"
                      value={adSponsorForm.walkMinutes}
                      onChange={(e) =>
                        setAdSponsorForm((prev) => ({
                          ...prev,
                          walkMinutes: e.target.value,
                        }))
                      }
                      placeholder="例如：3"
                    />
                  </div>

                  <div className="ala-sponsor-actions">
                    <button
                      className="ala-btn primary ala-save-sponsor-btn"
                      disabled={savingAdSponsor}
                      onClick={saveAdSponsor}
                    >
                      {savingAdSponsor ? "儲存中..." : "儲存店家資訊"}
                    </button>

                    <button
                      className="ala-btn danger ala-save-sponsor-btn"
                      disabled={savingAdSponsor}
                      onClick={clearAdSponsor}
                    >
                      清除店家資訊
                    </button>
                  </div>

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
                    <Fragment key={slot.key}>
                      {slot.key === "entrancePhoto" && (
                        <hr className="ala-asset-divider" />
                      )}
                    <div className="ala-asset-card">
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
                    </Fragment>
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
