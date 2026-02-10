// frontend/src/components/ParkingMap.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from "@vis.gl/react-google-maps";

import LotBottomSheet from "./LotBottomSheet";
import Spinner from "react-bootstrap/Spinner";
import { FaCircle } from "react-icons/fa";
import { TiLocationArrow } from "react-icons/ti";

import { formatTime, minutesAgo, minSecAgo } from "../utils/time";

function getPinColorsFromVacancy(v) {
  if (v == null) return { bg: "#9AA0A6", border: "#5F6368", glyph: "#FFFFFF" }; // unknown = 灰
  if (v === 0) return { bg: "#EA4335", border: "#C5221F", glyph: "#FFFFFF" }; // 0 = 紅
  if (v <= 5) return { bg: "#FBBC04", border: "#C58F00", glyph: "#202124" };  // 少 = 黃
  return { bg: "#34A853", border: "#0F7B2E", glyph: "#FFFFFF" };              // 多 = 綠
}

function openGoogleNavFromLot(lot) {
  if (!lot) return;

  // Prefer coordinates if you have them
  const lat = lot.lat ?? lot.latitude;
  const lng = lot.lng ?? lot.longitude;

  let url = "";

  if (lot.addressZh) {
    // Fallback to address if no lat/lng
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

function getOffsetCenterLatLng(map, lat, lng, offsetYPx) {
  const g = window.google;
  if (!map || !g?.maps?.LatLng) return { lat, lng };

  const proj = map.getProjection?.();
  const zoom = map.getZoom?.();

  // projection is not ready until after map is initialized
  if (!proj || typeof zoom !== "number") return { lat, lng };

  const scale = Math.pow(2, zoom);
  const latLng = new g.maps.LatLng(lat, lng);
  const worldPoint = proj.fromLatLngToPoint(latLng);

  // Move the "camera center" DOWN by offsetYPx pixels (so the marker appears UP)
  const worldPointOffset = new g.maps.Point(
    worldPoint.x,
    worldPoint.y + offsetYPx / scale
  );

  const newCenter = proj.fromPointToLatLng(worldPointOffset);
  return { lat: newCenter.lat(), lng: newCenter.lng() };
}

function MyLocationLayer({ myPos, accuracyM }) {
  if (!myPos) return null;

  // Accuracy circle: Google-ish
  const accStyle = {
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: "rgba(66,133,244,0.18)", // Google blue-ish
    border: "1px solid rgba(66,133,244,0.25)",
    transform: "translate(-50%, -50%)",
  };

  // Dot: white ring + blue core
  const dotWrap = {
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 1px 6px rgba(0,0,0,0.25)",
    display: "grid",
    placeItems: "center",
  };

  const dotCore = {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "rgb(66,133,244)",
  };

  // If you want the accuracy circle to match meters, you need projection math
  // (convert meters -> pixels based on zoom/lat). For now we do a fixed "hint circle"
  // which is what many web apps do.
  // If you want true-size circle later, I can give you the meter->px formula.
  return (
    <>
      {/* “accuracy hint circle” (fixed-size visual cue) */}
      <AdvancedMarker position={myPos} zIndex={9998}>
        <div style={accStyle} />
      </AdvancedMarker>

      {/* Blue dot */}
      <AdvancedMarker position={myPos} zIndex={9999}>
        <div style={dotWrap} aria-label="我的位置">
          <div style={dotCore} />
        </div>
      </AdvancedMarker>
    </>
  );
}

function FitAndFly({ lots, flyToRef, focus }) {
  const map = useMap();
  const userMovedRef = useRef(false);
  const didInitialFitRef = useRef(false);

  useEffect(() => {
    if (!map) return;

    flyToRef.current = ({ lat, lng, zoom }) => {
      // mark that we're intentionally moving the camera (not user)
      // but still allow user to take over after
      map.panTo({ lat, lng });

      if (typeof zoom === "number") {
        const target = Math.round(zoom);
        const startRaw = map.getZoom?.();
        const start = Math.round(Number.isFinite(startRaw) ? startRaw : target);

        if (start !== target) {
          const dir = target > start ? 1 : -1;
          let z = start;
          const id = window.setInterval(() => {
            z += dir;

            // clamp + stop condition (works even if start was fractional)
            if ((dir > 0 && z >= target) || (dir < 0 && z <= target)) {
              map.setZoom(target);
              window.clearInterval(id);
              return;
            }

            map.setZoom(z);
          }, 80);

          window.setTimeout(() => window.clearInterval(id), 1500); // safety
        }
      }
    };
  }, [map, flyToRef]);

  useEffect(() => {
    if (!map) return;

    const onDrag = () => { userMovedRef.current = true; };
    const onZoom = () => { userMovedRef.current = true; };

    const l1 = map.addListener("dragstart", onDrag);
    const l2 = map.addListener("zoom_changed", onZoom);

    return () => {
      l1?.remove?.();
      l2?.remove?.();
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    if (didInitialFitRef.current) return;

    if (focus?.lat != null && focus?.lng != null) return;

    const pts = (lots || [])
      .filter((l) => typeof l.lat === "number" && typeof l.lng === "number")
      .map((l) => ({ lat: l.lat, lng: l.lng }));

    if (pts.length === 0) return;
    if (userMovedRef.current) return;

    const g = window.google;
    if (!g?.maps?.LatLngBounds) return;

    const bounds = new g.maps.LatLngBounds();
    pts.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 80);

    didInitialFitRef.current = true;
  }, [map, lots, focus?.lat, focus?.lng]);

  return null;
}

function VacancyPin({ vacancy, active, pulse }) {
  const { bg, border, glyph } = getPinColorsFromVacancy(vacancy);

  return (
    <div
      className={"vl-pin vl-pin--num " + (pulse ? "pulse" : "")}
      style={{
        "--pin-bg": bg,
        borderColor: border,
        color: glyph,
      }}
    >
      {pulse ? (
        <>
          <div className="vl-pin-pulse" />
          <div className="vl-pin-num">{vacancy ?? "?"}</div>
        </>
      ) : (
        <div className="vl-pin-num">{vacancy ?? "?"}</div>
      )}
    </div>

  );
}


export default function ParkingMap({
  lots,
  active,
  setActive,
  flyToRef,
  focus,
  setFocus,
  pulseLotId,
  triggerLotPulse,
  locatingMe,              // boolean from parent
  requestMyLocation,       // function from parent (does geolocation)
  myPos,
  myAcc,
}) {

  const map = useMap();
  const adjustedForIdRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const didSetReadyRef = useRef(false);

  const isMobile = window.matchMedia?.("(max-width: 900px)")?.matches ?? false;
  const flyToOffset = isMobile ? -0.002 : 0.002;

  const iwOffset =
    window.google?.maps?.Size
      ? new window.google.maps.Size(0, isMobile ? -50 : -0) // tune these
      : undefined;

  return (
    <div className="map-wrap">
      <Map
        style={{ width: "100%", height: "100%" }}
        defaultCenter={{ lat: 25.0522, lng: 121.5203 }}
        defaultZoom={14}
        gestureHandling={"greedy"}
        disableDefaultUI={false}
        clickableIcons={false}
        onClick={() => setActive?.(null)}
        onIdle={() => {
          if (didSetReadyRef.current) return;
          didSetReadyRef.current = true;
          setMapReady(true);
        }}
        mapId={import.meta.env.VITE_GOOGLE_MAP_ID}
      >
        {/*<MyLocationLayer myPos={myPos} accuracyM={myAcc} />*/}

        {/*<CloseInfoOnMapClick setActive={setActive} />*/}
        <FitAndFly 
          lots={lots} 
          flyToRef={flyToRef} 
          focus={focus} 
        />

        {/* Search focus marker (special pin) */}
        {focus?.lat != null && focus?.lng != null && (
          <AdvancedMarker
            position={{ lat: focus.lat, lng: focus.lng }}
            zIndex={9999}
            onClick={() => {
              flyToRef.current?.({ lat: focus.lat+flyToOffset, lng: focus.lng, zoom: 16 });
            }}
          >
            <div className="search-pin" aria-label="搜尋位置">
              <div className="search-pin-pulse" />
              <div className="search-pin-dot" />
              <div className="search-pin-label">{focus?.name?.[0] ?? "?"}</div>
            </div>
          </AdvancedMarker>
        )}

        {lots.map((l) => (
          <AdvancedMarker
            key={l.lotId}
            position={{ lat: l.lat, lng: l.lng }}
            onClick={() => {
              setActive?.(l);
              triggerLotPulse(l.lotId);
              // tune this based on your sheet height
              const offsetY = Math.round(window.innerHeight * 0);
              flyToRef.current?.({ lat: l.lat+flyToOffset, lng: l.lng, zoom: 16 });
            }}
          >
            <VacancyPin vacancy={l.vacancy} active={active?.lotId === l.lotId} 
              pulse={l.lotId === pulseLotId}
            />
          </AdvancedMarker>
        ))}

        {!isMobile && active && (
          <InfoWindow
            position={{ lat: active.lat, lng: active.lng }}
            onCloseClick={() => setActive?.(null)}
            /*
            disableAutoPan
            options={{
              disableAutoPan: true,
              //pixelOffset: iwOffset, // <-- add this
            }}
            */
          >
            <div className="iw-content-wrapper">
              <div className="iw-hero-outer">
                <div className="iw-hero">
                  <img
                    className="iw-hero-img"
                    src="https://placehold.co/640x240/f9f9f9/999999/png?text=Parking"
                    alt=""
                    loading="lazy"
                  />
                </div>
              </div>

              <div style={{ minWidth: 120 }}>

                <div style={{ 
                  display: "flex", 
                  flexDirection: "column",
                  borderBottom: "1px solid #eee",
                  padding: "0px 3px 10px 3px",
                  marginTop: "10px"
                }}>
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "flex-start",
                  }}>
                    <div style={{ 
                      fontSize: 15, 
                      fontWeight: 700, 
                      marginBottom: "6px",
                      marginRight: "20px" 
                    }}>
                      {active.name}
                    </div>
                    <div style={{
                      fontSize: "15px",
                      fontWeight: "700",
                      color: "#317bff",
                      marginBottom: "6px",
                      flexShrink: "0"
                    }}>
                      空位：
                      <span style={{ fontSize: 15, fontWeight: 700 }}>
                        {active.vacancy ?? "未知"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span style={{
                      fontSize: "12px"
                    }}>{active.addressZh}</span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    flexDirection: "column",
                    padding: "6px 3px 0px 6px"
                  }}
                >
                  {(() => {
                    const m = minutesAgo(active.lastUpdated);
                    if (m == null) return null;
                    if (m <= 3) return null;
                    return (
                      <div style={{
                        marginTop: "6px",
                        fontSize: "11px",
                        color: "#ea4336",
                        fontWeight: "900"
                      }}>
                        資料可能延遲（{m} 分鐘）
                      </div>
                    );
                  })()}

                  <div
                    style={{
                      display: "flex",
                      gap: "5px"
                    }}
                  >
                    <div style={{ marginTop: 6, fontSize: 10.5 }}>
                      最近更新：{formatTime(active.lastUpdated)}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10.5 }}>
                      {(() => {
                        const ms = minSecAgo(active.lastUpdated);
                        if (!ms) return null;

                        // 想要永遠顯示「X 分 Y 秒前」
                        return (
                          <div style={{ marginTop: 0, fontSize: 10.5 }}>
                            （{ms.min} 分 {String(ms.sec).padStart(2, "0")} 秒前）
                          </div>
                        );

                        // 如果你更想在 < 60 秒時顯示「Y 秒前」，用這個：
                        // const txt = ms.min <= 0 ? `${ms.sec} 秒前` : `${ms.min} 分 ${String(ms.sec).padStart(2,"0")} 秒前`;
                        // return <div style={{ marginTop: 6, fontSize: 10.5 }}>（{txt}）</div>;
                      })()}
                    </div>
                  </div>

                </div>
              </div>
            </div>

            <div className="iw-actions">
              <button
                className="iw-navBtn"
                onClick={() => openGoogleNavFromLot(active)}
                type="button"
              >
                開始導航
              </button>
            </div>

          </InfoWindow>
        )}

      </Map>

      {/* Locate control (bottom-right) */}
      <button
        type="button"
        className={"map-locate-btn " 
          + (mapReady ? "ready " : " ")
          + (myPos?.lat != null && myPos?.lng != null ? "active" : " ")
        }
        onClick={() => requestMyLocation?.()}
        disabled={!!locatingMe}
        aria-label="定位到我的位置"
      >
        {locatingMe ? (
          <Spinner className="map-locate-spinner" animation="border" role="status" size="sm" />
        ) : (
          <TiLocationArrow size={32} />
        )}
      </button>

      {isMobile && (
        <LotBottomSheet
          active={active}
          onClose={() => setActive?.(null)}
        />
      )}
    </div>
  );
}


