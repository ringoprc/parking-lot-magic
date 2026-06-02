// frontend/src/components/LotBottomSheet.jsx
import { useEffect, useState } from "react";
import { 
  formatTime, 
  formatTimeYYYYMMDD_HHMMSS, 
  minutesAgo, 
  minSecAgo 
} from "../utils/time";
import toast from "react-hot-toast";

import { MdDirectionsWalk, MdContentCopy } from "react-icons/md";

import lotImage from "../assets/lots_demo_img.jpg";
import sponsorImage from "../assets/sponser_demo_img.jpeg";

import "./LotBottomSheet.css";

const NAV_AD_SECONDS = 9;

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

function getGoogleNavUrl(active) {
  if (!active) return "";

  const lat = active.lat ?? active.latitude;
  const lng = active.lng ?? active.longitude;

  if (lat != null && lng != null) {
    const dest = `${lat},${lng}`;
    return (
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${encodeURIComponent(dest)}` +
      `&travelmode=driving`
    );
  }

  if (active.addressZh) {
    return (
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${encodeURIComponent(active.addressZh)}` +
      `&travelmode=driving`
    );
  }

  return "";
}

function openGoogleNav(active, { sameTab = false } = {}) {
  const url = getGoogleNavUrl(active);
  if (!url) return;

  if (sameTab) {
    window.location.assign(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

async function copyToClipboard(text) {
  if (text == null) return;
  const value = String(text).trim();
  if (!value) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      toast.success("已成功複製資訊");
      return;
    }
  } catch (_) {
    // fall through to legacy approach
  }

  // Legacy fallback (older iOS / insecure context)
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-9999px";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    toast.success("已成功複製資訊");
  } finally {
    document.body.removeChild(ta);
  }
}


export default function LotBottomSheet({ 
  active, 
  onClose, 
  lastSheetFetchAt,
  lastFrontendFetchAt 
}) {
  const [open, setOpen] = useState(false);
  const [navAdOpen, setNavAdOpen] = useState(false);
  const [navCountdown, setNavCountdown] = useState(NAV_AD_SECONDS);
  const [navAdStartedAt, setNavAdStartedAt] = useState(null);


  //---------------------------
  // useEffects
  //---------------------------

  // open when active exists, close when active is null
  useEffect(() => {
    setOpen(!!active);
  }, [active]);

  useEffect(() => {
    if (!navAdOpen || !navAdStartedAt) return;

    const interval = setInterval(() => {
      const elapsedMs = Date.now() - navAdStartedAt;
      const remainingMs = Math.max(NAV_AD_SECONDS * 1000 - elapsedMs, 0);

      setNavCountdown(Math.ceil(remainingMs / 1000));

      if (remainingMs <= 0) {
        clearInterval(interval);
        setNavCountdown(0);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [navAdOpen, navAdStartedAt]);

  useEffect(() => {
    if (!active) {
      setNavAdOpen(false);
      setNavCountdown(NAV_AD_SECONDS);
      setNavAdStartedAt(null);
    }
  }, [active]);


  //---------------------------
  // Functions
  //---------------------------

  function startNavigationWithAd() {
    if (!active) return;

    setOpen(false); // close bottom info sheet
    setNavCountdown(NAV_AD_SECONDS);
    setNavAdStartedAt(Date.now());
    setNavAdOpen(true);
  }

  function proceedNavigationFromAd() {
    if (!active) return;

    setNavAdOpen(false);
    setNavAdStartedAt(null);
    setNavCountdown(NAV_AD_SECONDS);

    openGoogleNav(active, { sameTab: true });
  }

  function close() {
    setOpen(false);
    onClose?.();
  }

  // Prevent the map from stealing scroll when you scroll inside the sheet (iOS)
  function stopMapGesture(e) {
    e.stopPropagation();
  }


  //---------------------------
  // Return
  //---------------------------

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
                <MdDirectionsWalk size={18} />
                <div className="vl-sheet-sponsor-meta-div">
                  <span style={{ fontSize: "10px" }}>店家步行距離 10m 內</span>
                </div>
              </div>
            </div>
          </div>

          {active && (
            <div className="vl-sheet-body">
              <div className="vl-sheet-titleRow" style={{ display:"flex", flexDirection: "column" }}>
                <div className="vl-sheet-titleRow-inner">
                  {/* 台灣聯通停車場-晴光商圈場 */}
                  <div className={"vl-sheet-title " 
                    + (active.name.length > 9 ? "is-long-name" : "")}
                  >
                    <div
                      className="vl-copyBtn"
                      aria-label="複製停車場名稱"
                      title="複製停車場名稱"
                      onClick={() => copyToClipboard(active.name)}
                    >
                      <MdContentCopy size={14} />
                    </div>
                    <div style={{ marginTop: "2.5px" }}>
                      <span>{active.name}</span>
                    </div>
                  </div>
                  {/* 空位：10 */}
                  <div className={"vl-sheet-vac "
                    + (active.name.length > 9 ? "is-long-name" : "")}
                    style={{ color: getVacancyTextColor(active.vacancy) }}
                  >
                    空位：
                    <span className="vl-sheet-vacNum">{active.vacancy ?? "未知"}</span>
                  </div>
                </div>
                {/* 臺北市中山區林森北路538號 */}
                <div className="vl-sheet-addr">
                  <div
                    className="vl-copyBtn"
                    aria-label="複製停車場名稱"
                    title="複製停車場名稱"
                    onClick={() => copyToClipboard(active.addressZh)}
                  >
                    <MdContentCopy size={12} />
                  </div>
                  <div style={{ marginTop: "1px" }}>
                    <span>{active.addressZh}</span>
                  </div>
                </div>
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
                  <div>空位數字最近更新：{formatTimeYYYYMMDD_HHMMSS(active.lastUpdated)}</div>
                  {(() => {
                    const ms = minSecAgo(active.lastUpdated);
                    if (!ms) return null;
                    return (
                      <div
                        style={{
                          maxWidth: "30%",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}
                      >
                        （{ms.min} 分 {String(ms.sec).padStart(2, "0")} 秒前）
                      </div>
                    );
                  })()}
                </div>
              </div>

              <button
                className="vl-sheet-navBtn"
                onClick={startNavigationWithAd}
                type="button"
              >
                開始導航
              </button>

            </div>
          )}
        </div>
      </div>

      {navAdOpen && (
        <div
          className="vl-nav-ad-layer"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="vl-nav-ad-modal">

            {navCountdown <= 0 && (
              <button
                className="vl-nav-ad-close"
                type="button"
                onClick={proceedNavigationFromAd}
                aria-label="開始導航"
              >
                <span>×</span>
              </button>
            )}

            <div className="vl-nav-ad-title" style={{ color: navCountdown > 0 ? "#111" : "#ffff00" }}>
              {navCountdown > 0
                ? `正在準備導航：還剩 ${navCountdown} 秒...`
                : "_"}
            </div>

            <img
              className="vl-nav-ad-img"
              src={sponsorImage}
              alt="advertisement"
            />

            <div className="vl-nav-ad-progressTrack">
              <div
                key={navAdStartedAt}
                className="vl-nav-ad-progressBar"
                style={{
                  animationDuration: `${NAV_AD_SECONDS}s`
                }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
