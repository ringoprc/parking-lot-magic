// frontend/src/components/LotBottomSheet.jsx
import { useEffect, useState } from "react";
import { formatTime, minutesAgo, minSecAgo } from "../utils/time";
import "./LotBottomSheet.css";

import lotImage from "../assets/lots_demo_img.jpg";
import sponsorImage from "../assets/sponser_demo_img.jpeg";

function toVacancyNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getVacancyTextColor(v) {
  const n = toVacancyNum(v);
  if (n == null) return "#b6b6b6";   // unknown -> gray (pin border)
  if (n === 0) return "#C5221F";     // 0 -> red (pin border)
  if (n <= 5) return "#C58F00";      // low -> yellow (pin border)
  return "#0F7B2E";                  // ok -> green (pin border)
}

function openGoogleNav(active) {
  if (!active) return;

  // Prefer coordinates if you have them
  const lat = active.lat ?? active.latitude;
  const lng = active.lng ?? active.longitude;

  let url = "";

  if (active.addressZh) {
    // Fallback to address if no lat/lng
    url =
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${encodeURIComponent(active.addressZh)}` +
      `&travelmode=driving`;
  } else if (lat != null && lng != null) {
    const dest = `${lat},${lng}`;
    url =
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${encodeURIComponent(dest)}` +
      `&travelmode=driving`;
  } else {
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}


export default function LotBottomSheet({ 
  active, 
  onClose, 
  lastSheetFetchAt,
  lastFrontendFetchAt 
}) {
  const [open, setOpen] = useState(false);

  // open when active exists, close when active is null
  useEffect(() => {
    setOpen(!!active);
  }, [active]);

  function close() {
    setOpen(false);
    onClose?.();
  }

  // Prevent the map from stealing scroll when you scroll inside the sheet (iOS)
  function stopMapGesture(e) {
    e.stopPropagation();
  }

  // Keep the sheet mounted for the close animation, but hide if no active and not open
  if (!active && !open) return null;

  return (
    <div className="vl-sheet-layer" onClick={close}>
      <div
        className={`vl-sheet ${open ? "open" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vl-sheet-handle">
          <div className="vl-sheet-grabber" />
          <button className="vl-sheet-close" onClick={close} aria-label="close">
            ×
          </button>
        </div>

        <div
          className="vl-sheet-content"
          onTouchStart={stopMapGesture}
          onTouchMove={stopMapGesture}
        >
          <div className="vl-sheet-hero">
            <div className="vl-sheet-hero-img-div">
              <img
                className="vl-sheet-hero-img"
                onClick={() => openGoogleNav(active)}
                //src="https://placehold.co/340x240/f9f9f9/999999/png?text=Parking"
                src={lotImage}
                alt=""
                loading="lazy"
              />
            </div>
            <div className="vl-sheet-sponsor-img-div">
              <div style={{ position: "relative" }}>
                <img
                  className="vl-sheet-sponsor-img"
                  //src="https://placehold.co/340x340/f9f9f9/999999/png?text=Sponsor"
                  src={sponsorImage}
                  alt=""
                  loading="lazy"
                />
                <span className="vl-sheet-sponsor-example-label">範例</span>
              </div>
              <div className="vl-sheet-sponsor-distance-label-div">
                <p className="mb-0">店家步行距離：10m 內</p>
              </div>
            </div>
          </div>

          {active && (
            <div className="vl-sheet-body">
              <div className="vl-sheet-titleRow" style={{ display:"flex", flexDirection: "column" }}>
                <div className="vl-sheet-titleRow-inner">
                  <div className="vl-sheet-title">{active.name}</div>
                  <div className="vl-sheet-vac"
                    style={{ color: getVacancyTextColor(active.vacancy) }}
                  >
                    空位：
                    <span className="vl-sheet-vacNum">
                      {active.vacancy ?? "未知"}
                    </span>
                  </div>
                </div>
                <div className="vl-sheet-addr">{active.addressZh}</div>
              </div>

              {(() => {
                const m = minutesAgo(active.lastUpdated);
                if (m == null) return null;
                if (m <= 3) return null;
                return (
                  <div className="vl-sheet-warn">
                    資料可能延遲（{m} 分鐘）
                  </div>
                );
              })()}

              <div>
                <div className="vl-sheet-meta">
                  <div>空位數字最近更新時間：{formatTime(active.lastUpdated)}</div>
                  {(() => {
                    const ms = minSecAgo(active.lastUpdated);
                    if (!ms) return null;
                    return (
                      <div>
                        （{ms.min} 分 {String(ms.sec).padStart(2, "0")} 秒前）
                      </div>
                    );
                  })()}
                </div>
                {/*
                {lastSheetFetchAt ? (
                  <div className="vl-sheet-meta-sheet-fetch">
                    最近後台抓取 Google 表單資料時間：{formatTime(lastSheetFetchAt)}
                    {(() => {
                      const ms = minSecAgo(lastSheetFetchAt);
                      if (!ms) return null;
                      return (
                        <span>
                          {" "}
                          （{ms.min} 分 {String(ms.sec).padStart(2, "0")} 秒前）
                        </span>
                      );
                    })()}
                  </div>
                ) : null}
                {lastFrontendFetchAt ? (
                  <div className="vl-sheet-meta-frontend-fetch">
                    最近抓取後台資料時間：{formatTime(lastFrontendFetchAt)}
                    {(() => {
                      const ms = minSecAgo(lastFrontendFetchAt);
                      if (!ms) return null;
                      return (
                        <span>
                          {" "}
                          （{ms.min} 分 {String(ms.sec).padStart(2, "0")} 秒前）
                        </span>
                      );
                    })()}
                  </div>
                ) : null}
                */}
              </div>


              <div className="vl-sheet-actions">
                <button
                  className="vl-sheet-navBtn"
                  onClick={() => openGoogleNav(active)}
                  type="button"
                >
                  開始導航
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
