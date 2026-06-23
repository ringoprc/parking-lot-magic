// frontend/src/components/ParkingLotInfoWindow.jsx
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { InfoWindow } from "@vis.gl/react-google-maps";
import toast from "react-hot-toast";
import { MdDirectionsWalk, MdContentCopy } from "react-icons/md";

import {
  formatTimeYYYYMMDD_HHMMSS,
  minutesAgo,
  minSecAgo,
} from "../utils/time";

import lotImage from "../assets/lots_demo_img.jpg";
import sponsorImage from "../assets/sponser_demo_img.jpeg";

import "./ParkingLotInfoWindow.css";

const NAV_AD_SECONDS = 3;

function toVacancyNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getVacancyTextColor(v) {
  const n = toVacancyNum(v);
  if (n == null) return "#b6b6b6";
  if (n === 0) return "#C5221F";
  if (n <= 5) return "#C58F00";
  return "#0F7B2E";
}

function openGoogleNavFromLot(lot) {
  if (!lot) return;

  const lat = lot.lat ?? lot.latitude;
  const lng = lot.lng ?? lot.longitude;

  let url = "";

  // Testing default to [lat, lng]
  if (lot.addressZh && !lot.addressZh) {
    url =
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${encodeURIComponent(lot.addressZh)}` +
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

function getGoogleNavUrl(lot) {
  if (!lot) return "";

  const lat = lot.lat ?? lot.latitude;
  const lng = lot.lng ?? lot.longitude;

  if (lat != null && lng != null) {
    const dest = `${lat},${lng}`;

    return (
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${encodeURIComponent(dest)}` +
      `&travelmode=driving`
    );
  }

  if (lot.addressZh) {
    return (
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${encodeURIComponent(lot.addressZh)}` +
      `&travelmode=driving`
    );
  }

  return "";
}

function openGoogleNav(lot, { sameTab = false } = {}) {
  const url = getGoogleNavUrl(lot);
  if (!url) return;

  if (sameTab) {
    window.location.assign(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function getGoogleNavUrlFromDestination(destination) {
  const value = String(destination || "").trim();
  if (!value) return "";

  return (
    `https://www.google.com/maps/dir/?api=1` +
    `&destination=${encodeURIComponent(value)}` +
    `&travelmode=driving`
  );
}

function openGoogleNavToDestination(destination, { sameTab = false } = {}) {
  const url = getGoogleNavUrlFromDestination(destination);
  if (!url) return false;

  if (sameTab) {
    window.location.assign(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return true;
}

function getAdStoreDestination(lot) {
  const storeName = String(lot?.adSponsor?.storeName || "").trim();
  const storeAddress = String(lot?.adSponsor?.storeAddress || "").trim();

  if (!storeAddress) return "";

  return [storeName, storeAddress].filter(Boolean).join(" ");
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
    // fall through
  }

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

export default function ParkingLotInfoWindow({
  active,
  setActive,
}) {
  if (!active) return null;

  const [navAdOpen, setNavAdOpen] = useState(false);
  const [navCountdown, setNavCountdown] = useState(NAV_AD_SECONDS);
  const [navAdStartedAt, setNavAdStartedAt] = useState(null);
   const [navAdMode, setNavAdMode] = useState("navigation"); // "navigation" | "sponsorPreview"

  const hasBottomSheetSponsor = !!active?.adAssets?.bottomSheetExample?.url;

  const bottomSheetSponsorUrl = hasBottomSheetSponsor
    ? active.adAssets.bottomSheetExample.url
    : sponsorImage;

  const navigationAdUrl =
    active?.adAssets?.navigationSquare?.url ||
    active?.adAssets?.bottomSheetExample?.url ||
    sponsorImage;


  //------------------
  // UseEffects
  //------------------
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
      setNavAdMode("navigation");
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const realNavigationAdUrl =
      active?.adAssets?.navigationSquare?.url ||
      active?.adAssets?.bottomSheetExample?.url;

    if (!realNavigationAdUrl) return;

    const img = new Image();
    img.src = realNavigationAdUrl;
  }, [active]);


  function startNavigationWithAd() {
    if (!active) return;

    setNavAdMode("navigation");
    setNavCountdown(NAV_AD_SECONDS);
    setNavAdStartedAt(Date.now());
    setNavAdOpen(true);
  }

  function openSponsorAdPreview(e) {
    e?.stopPropagation?.();
    if (!active) return;

    setNavAdMode("sponsorPreview");
    setNavCountdown(0);
    setNavAdStartedAt(null);
    setNavAdOpen(true);
  }

  function resetNavAdModal() {
    setNavAdOpen(false);
    setNavAdStartedAt(null);
    setNavCountdown(NAV_AD_SECONDS);
    setNavAdMode("navigation");
  }

  function dismissNavAdModal(e) {
    e?.stopPropagation?.();
    resetNavAdModal();
  }

  function proceedNavigationFromAd() {
    if (!active) return;

    resetNavAdModal();
    openGoogleNav(active, { sameTab: true });
  }

  function proceedNavigationToStoreFromAd() {
    const destination = getAdStoreDestination(active);

    if (!destination) {
      toast.error("尚未設定廣告店家地址");
      return;
    }

    resetNavAdModal();
    openGoogleNavToDestination(destination, { sameTab: true });
  }

  //------------------
  // Return
  //------------------
  return (
    <>
      <InfoWindow
        position={{ lat: active.lat, lng: active.lng }}
        onCloseClick={() => setActive?.(null)}
      >
        <div
          className="iw-content-wrapper"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >

          <div className="iw-sheet-hero">
            <div className="iw-sheet-hero-img-div">
              <img
                className="iw-sheet-hero-img"
                onClick={() => openGoogleNavFromLot(active)}
                //src="https://placehold.co/340x240/f9f9f9/999999/png?text=Parking"
                src={lotImage}
                alt=""
                loading="lazy"
              />
            </div>
            <div className="iw-sheet-sponsor-img-div">
              <div style={{ position: "relative" }}>
                <img
                  className="iw-sheet-sponsor-img"
                  src={bottomSheetSponsorUrl}
                  style={{ opacity: hasBottomSheetSponsor ? "1" : "0.2" }}
                  alt=""
                  loading="lazy"
                  role="button"
                  onClick={openSponsorAdPreview}
                />

                {!hasBottomSheetSponsor && (
                  <span className="iw-sheet-sponsor-example-label">範例</span>
                )}
              </div>
              <div className="iw-sheet-sponsor-distance-label-div">
                <MdDirectionsWalk size={16} />
                <div className="iw-sheet-sponsor-meta-div">
                  <span style={{ fontSize: "11px" }}>店家步行距離 10m 內</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ minWidth: 120 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                borderBottom: "1px solid #eee",
                padding: "0px 3px 10px 3px",
                marginTop: "10px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div className="iw-actions"
                  style={{
                    display: "flex",
                    fontSize: 15,
                    fontWeight: 700,
                    marginBottom: "6px",
                    marginRight: "20px",
                    alignItems: "center",
                    gap: "7px",
                  }}
                >
                  <div
                    className="vl-copyBtn"
                    aria-label="複製停車場名稱"
                    title="複製停車場名稱"
                    onClick={() => copyToClipboard(active.name)}
                  >
                    <MdContentCopy size={14} />
                  </div>
                  <span style={{ marginTop: "3px" }}>{active.name}</span>
                </div>

                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "700",
                    color: getVacancyTextColor(active.vacancy),
                    marginBottom: "6px",
                    flexShrink: "0",
                    marginTop: "4px"
                  }}
                >
                  空位：
                  <span>
                    {active.vacancy ?? "未知"}
                  </span>
                </div>
              </div>

              <div className="iw-actions"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <div
                  className="vl-copyBtn"
                  aria-label="複製停車場名稱"
                  title="複製停車場名稱"
                  onClick={() => copyToClipboard(active.addressZh)}
                >
                  <MdContentCopy size={12} />
                </div>
                <span style={{ fontSize: "11.5px", fontWeight: "400", color: "#666", marginTop: "2.5px" }}>{active.addressZh}</span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                flexDirection: "column",
                padding: "6px 3px 0px 6px",
              }}
            >
              {(() => {
                const m = minutesAgo(active.lastUpdated);
                if (m == null) return null;
                if (m <= 3) return null;

                return (
                  <div
                    style={{
                      marginTop: "6px",
                      fontSize: "11px",
                      color: "#ea4336",
                      fontWeight: "900",
                    }}
                  >
                    資料可能延遲（{m} 分鐘）
                  </div>
                );
              })()}

              <div
                style={{
                  display: "flex",
                  gap: "5px",
                }}
              >
                <div style={{ marginTop: 6, fontSize: 10.5 }}>
                  最近更新：{formatTimeYYYYMMDD_HHMMSS(active.lastUpdated)}
                </div>

                <div style={{ marginTop: 6, fontSize: 10.5 }}>
                  {(() => {
                    const ms = minSecAgo(active.lastUpdated);
                    if (!ms) return null;

                    return (
                      <div style={{ marginTop: 0, fontSize: 10.5 }}>
                        （{ms.min} 分 {String(ms.sec).padStart(2, "0")} 秒前）
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="iw-actions iw-nav-outer-div">
          <button
            className="iw-navBtn"
            onClick={startNavigationWithAd}
            type="button"
          >
            開始導航
          </button>
        </div>
      </InfoWindow>

      {navAdOpen &&
        createPortal(
          <div
            className="iw-nav-ad-layer"
            onClick={dismissNavAdModal}
          >
            <div
              className={`iw-nav-ad-modal ${navAdMode === "sponsorPreview" ? "preview" : ""}`}
              onClick={(e) => e.stopPropagation()}
              style={{ paddingTop: navCountdown > 0 ? '42px' : '56px' }}
            >
              {/*
              {navCountdown <= 0 && (
                <button
                  className="iw-nav-ad-close"
                  type="button"
                  onClick={proceedNavigationFromAd}
                  aria-label="開始導航"
                >
                  <span>×</span>
                </button>
              )}
              */}

              {navAdMode === "navigation" && (
                <div
                  className="iw-nav-ad-title"
                  style={{ color: navCountdown > 0 ? "#111" : "#ffffff" }}
                >
                  {navCountdown > 0
                    ? `正在準備導航：還剩 ${navCountdown} 秒...`
                    : ""}
                </div>
              )}

              <img
                className="iw-nav-ad-img"
                src={navAdMode === "sponsorPreview" ? bottomSheetSponsorUrl : navigationAdUrl}
                alt="advertisement"
              />

              {navAdMode === "navigation" && navCountdown > 0 ? (
                <div className="iw-nav-ad-progressTrack">
                  <div
                    key={navAdStartedAt}
                    className="iw-nav-ad-progressBar"
                    style={{
                      animationDuration: `${NAV_AD_SECONDS}s`,
                    }}
                  />
                </div>
              ) : (
                <div className={`iw-nav-ad-choiceRow ${navAdMode === "sponsorPreview" ? "single" : ""}`}>
                  <button
                    className="iw-nav-ad-choiceBtn store"
                    type="button"
                    onClick={proceedNavigationToStoreFromAd}
                  >
                    導航至廣告店家
                  </button>

                  {navAdMode === "navigation" && (
                    <button
                      className="iw-nav-ad-choiceBtn lot"
                      type="button"
                      onClick={proceedNavigationFromAd}
                    >
                      繼續導航至停車場
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>,
        document.body
      )}
        
    </>
  );
}

