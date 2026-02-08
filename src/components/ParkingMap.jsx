// frontend/src/components/ParkingMap.jsx
import { useEffect, useRef } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from "@vis.gl/react-google-maps";

import { formatTime, minutesAgo } from "../utils/time";

function getPinColorsFromVacancy(v) {
  if (v == null) return { bg: "#9AA0A6", border: "#5F6368", glyph: "#FFFFFF" }; // unknown = 灰
  if (v === 0) return { bg: "#EA4335", border: "#C5221F", glyph: "#FFFFFF" }; // 0 = 紅
  if (v <= 5) return { bg: "#FBBC04", border: "#C58F00", glyph: "#202124" };  // 少 = 黃
  return { bg: "#34A853", border: "#0F7B2E", glyph: "#FFFFFF" };              // 多 = 綠
}

function FitAndFly({ lots, flyToRef, focus }) {
  const map = useMap();
  const didInitialFitRef = useRef(false);

  // -----------------------------------
  // When focus changes, pan/zoom (or fit viewport)
  // -----------------------------------
  useEffect(() => {
    if (!map) return;
    if (focus?.lat == null || focus?.lng == null) return;

    // Always "fly" feel: pan then zoom slightly later
    map.panTo({ lat: focus.lat, lng: focus.lng });

    const t = window.setTimeout(() => {
      map.setZoom(focus.zoom ?? 15);
    }, 180);

    return () => window.clearTimeout(t);
  }, [map, focus?.lat, focus?.lng, focus?.zoom]);

  useEffect(() => {
    if (!map) return;
    if (didInitialFitRef.current) return;

    if (focus?.lat != null && focus?.lng != null) return;

    const pts = (lots || [])
      .filter((l) => typeof l.lat === "number" && typeof l.lng === "number")
      .map((l) => ({ lat: l.lat, lng: l.lng }));

    if (pts.length === 0) return;

    const g = window.google;
    if (!g?.maps?.LatLngBounds) return;

    const bounds = new g.maps.LatLngBounds();
    pts.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 80);

    didInitialFitRef.current = true;
  }, [map, lots, focus?.lat, focus?.lng]);

  useEffect(() => {
    if (!map) return;

    flyToRef.current = ({ lat, lng }) => {
      map.panTo({ lat, lng });
      map.setZoom(16);
    };
  }, [map, flyToRef]);

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
  console.log('focus:', focus);
  return (
    <div className="map-wrap">
      <Map
        style={{ width: "100%", height: "100%" }}
        defaultCenter={{ lat: 25.0522, lng: 121.5203 }}
        defaultZoom={14}
        gestureHandling={"greedy"}
        disableDefaultUI={false}
        mapId={import.meta.env.VITE_GOOGLE_MAP_ID}
      >
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
            // Optional: click it to clear focus
            // onClick={() => setFocus?.(null)}
          >
            <div className="search-pin" aria-label="搜尋位置">
              <div className="search-pin-pulse" />
              <div className="search-pin-dot" />
              <div className="search-pin-label">{focus?.name[0] ?? "?"}</div>
            </div>
          </AdvancedMarker>
        )}

        {lots.map((l) => (
          <AdvancedMarker
            key={l.lotId}
            position={{ lat: l.lat, lng: l.lng }}
            onClick={() => {
              setActive?.(l);
              setFocus?.(null);
            }}
          >
            <VacancyPin vacancy={l.vacancy} active={active?.lotId === l.lotId} />
          </AdvancedMarker>
        ))}

        {active && (
          <InfoWindow
            position={{ lat: active.lat, lng: active.lng }}
            onCloseClick={() => setActive?.(null)}
          >
            <div className="iw-hero">
              <img
                className="iw-hero-img"
                src="https://placehold.co/640x240/f9f9f9/999999/png?text=Parking"
                alt=""
                loading="lazy"
              />
            </div>

            <div style={{ minWidth: 220 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {active.name}
              </div>
              <div>
                空位：{" "}
                <span style={{ fontWeight: 700 }}>
                  {active.vacancy ?? "未知"}
                </span>
              </div>

              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                更新：{formatTime(active.lastUpdated)}
              </div>

              {(() => {
                const m = minutesAgo(active.lastUpdated);
                if (m == null) return null;
                if (m <= 3) return null;
                return (
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    資料可能延遲（{m} 分鐘前）
                  </div>
                );
              })()}
            </div>
          </InfoWindow>
        )}
      </Map>
    </div>
  );
}


