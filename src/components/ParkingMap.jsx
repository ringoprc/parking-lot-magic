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

import { formatTime, minutesAgo, minSecAgo } from "../utils/time";

function getPinColorsFromVacancy(v) {
  if (v == null) return { bg: "#9AA0A6", border: "#5F6368", glyph: "#FFFFFF" }; // unknown = 灰
  if (v === 0) return { bg: "#EA4335", border: "#C5221F", glyph: "#FFFFFF" }; // 0 = 紅
  if (v <= 5) return { bg: "#FBBC04", border: "#C58F00", glyph: "#202124" };  // 少 = 黃
  return { bg: "#34A853", border: "#0F7B2E", glyph: "#FFFFFF" };              // 多 = 綠
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

/*
function CloseInfoOnMapClick({ setActive }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const listener = map.addListener("click", () => {
      setActive?.(null);
    });

    return () => listener?.remove?.();
  }, [map, setActive]);

  return null;
}
*/

function FitAndFly({ lots, flyToRef, focus }) {
  const map = useMap();
  const userMovedRef = useRef(false);
  const didInitialFitRef = useRef(false);

  // -----------------------------------
  // When focus changes, pan/zoom (or fit viewport)
  // -----------------------------------
  /*
  useEffect(() => {
    if (!map) return;
    if (focus?.lat == null || focus?.lng == null) return;

    map.panTo({ lat: focus.lat, lng: focus.lng });

    const target = focus.zoom ?? 15;
    const start = map.getZoom?.() ?? target;
    if (start === target) return;

    const dir = target > start ? 1 : -1;
    let z = start;
    const id = window.setInterval(() => {
      z += dir;
      map.setZoom(z);
      if (z === target) window.clearInterval(id);
    }, 80);

    return () => window.clearInterval(id);
  }, [map, focus?.lat, focus?.lng, focus?.zoom]);
  */

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

function VacancyPin({ vacancy }) {
  const { bg, border, glyph } = getPinColorsFromVacancy(vacancy);

  return (
    <div
      className="vl-pin vl-pin--num"
      style={{
        background: bg,
        borderColor: border,
        color: glyph,
      }}
    >
      <div className="vl-pin-num">{vacancy ?? "?"}</div>
    </div>
  );
}

export default function ParkingMap({ lots, active, setActive, flyToRef, focus, setFocus }) {

  const map = useMap();
  const adjustedForIdRef = useRef(null);

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
        mapId={import.meta.env.VITE_GOOGLE_MAP_ID}
      >
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

              // tune this based on your sheet height
              const offsetY = Math.round(window.innerHeight * 0);
              flyToRef.current?.({ lat: l.lat+flyToOffset, lng: l.lng, zoom: 16 });
            }}
          >
            <VacancyPin vacancy={l.vacancy} active={active?.lotId === l.lotId} />
          </AdvancedMarker>
        ))}

        {!isMobile && active && (
          <InfoWindow
            position={{ lat: active.lat, lng: active.lng }}
            onCloseClick={() => setActive?.(null)}
            disableAutoPan
            options={{
              disableAutoPan: true,
              //pixelOffset: iwOffset, // <-- add this
            }}
          >
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
          </InfoWindow>
        )}

      </Map>
      {isMobile && (
        <LotBottomSheet
          active={active}
          onClose={() => setActive?.(null)}
        />
      )}
    </div>
  );
}


