// frontend/src/components/ParkingLotInfoWindow.jsx
import { InfoWindow } from "@vis.gl/react-google-maps";
import {
  formatTimeYYYYMMDD_HHMMSS,
  minutesAgo,
  minSecAgo,
} from "../utils/time";
import toast from "react-hot-toast";
import { MdDirectionsWalk, MdContentCopy } from "react-icons/md";

import lotImage from "../assets/lots_demo_img.jpg";
import sponsorImage from "../assets/sponser_demo_img.jpeg";

import "./ParkingLotInfoWindow.css";

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

  return (
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
                //src="https://placehold.co/340x340/f9f9f9/999999/png?text=Sponsor"
                src={sponsorImage}
                alt=""
                loading="lazy"
              />
              <span className="iw-sheet-sponsor-example-label">範例</span>
            </div>
            <div className="iw-sheet-sponsor-distance-label-div">
              <MdDirectionsWalk size={18} />
              <div className="iw-sheet-sponsor-meta-div">
                <span style={{ fontSize: "9px" }}>店家步行距離</span>
                <span style={{ fontSize: "12px" }}>10m 內</span>
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
                  gap: "6px",
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
                <span>{active.name}</span>
              </div>

              <div
                style={{
                  fontSize: "15px",
                  fontWeight: "700",
                  color: getVacancyTextColor(active.vacancy),
                  marginBottom: "6px",
                  flexShrink: "0",
                }}
              >
                空位：
                <span style={{ fontSize: 15, fontWeight: 700 }}>
                  {active.vacancy ?? "未知"}
                </span>
              </div>
            </div>

            <div className="iw-actions"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
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
              <span style={{ fontSize: "12px" }}>{active.addressZh}</span>
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
          onClick={() => openGoogleNavFromLot(active)}
          type="button"
        >
          開始導航
        </button>
      </div>
    </InfoWindow>
  );
}

