// frontend/src/App.jsx
import { useEffect, useMemo, useState } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from "@vis.gl/react-google-maps";
import "./App.css";

function formatTime(d) {
  if (!d) return "未知";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "未知";
  return dt.toLocaleString();
}

function minutesAgo(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  const diffMs = Date.now() - dt.getTime();
  return Math.floor(diffMs / 60000);
}

function FitAndFly({ lots, flyTo }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const pts = (lots || [])
      .filter((l) => typeof l.lat === "number" && typeof l.lng === "number")
      .map((l) => ({ lat: l.lat, lng: l.lng }));

    if (pts.length === 0) return;

    // Fit bounds to all points (so pins are visible)
    const g = window.google;
    if (!g?.maps?.LatLngBounds) return;
    const bounds = new g.maps.LatLngBounds();
    pts.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 80); // padding px
  }, [map, lots]);

  // Expose map to parent via flyTo callback setter
  useEffect(() => {
    if (!map) return;
    flyTo.current = ({ lat, lng }) => {
      map.panTo({ lat, lng });
      map.setZoom(16);
    };
  }, [map, flyTo]);

  return null;
}

export default function App() {
  const [lots, setLots] = useState([]);
  const [active, setActive] = useState(null);

  const apiBase = import.meta.env.VITE_API_BASE || "";
  const area = "Zhongshan";

  // A ref-like object without importing useRef
  const flyTo = useMemo(() => ({ current: null }), []);

  async function loadLots() {
    const res = await fetch(
      `${apiBase}/api/lots?area=${encodeURIComponent(area)}`
    );
    const data = await res.json();
    setLots(data.results || []);
  }

  useEffect(() => {
    loadLots();
    const t = setInterval(loadLots, 15000);
    return () => clearInterval(t);
  }, []);

  const validLots = useMemo(
    () =>
      lots.filter(
        (l) =>
          typeof l.lat === "number" &&
          typeof l.lng === "number" &&
          /^ZS_\d+$/i.test(String(l.lotId || ""))
      ),
    [lots]
  );

  return (
    <div className="app-root">
      <div className="title-bar">
        <div className="title">Parking Vacancies — Zhongshan</div>
      </div>

      <div className="content">
        {/* Left list */}
        <div className="side">
          <div className="side-title">Lots ({validLots.length})</div>

          {validLots.map((l) => (
            <button
              key={l.lotId}
              className={`lot-btn ${active?.lotId === l.lotId ? "active" : ""}`}
              onClick={() => {
                setActive(l);
                flyTo.current?.({ lat: l.lat, lng: l.lng });
              }}
              type="button"
            >
              <div className="lot-btn-name">{l.name}</div>
              <div className="lot-btn-sub">
                空位：<b>{l.vacancy ?? "未知"}</b> ·{" "}
                {minutesAgo(l.lastUpdated) != null
                  ? `${minutesAgo(l.lastUpdated)}m ago`
                  : "—"}
              </div>
            </button>
          ))}
        </div>

        {/* Map */}
        <div className="map-wrap">
          <APIProvider
            apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
            libraries={["marker"]}   // important for AdvancedMarker
          >
            <Map
              style={{ width: "100%", height: "100%" }}
              defaultCenter={{ lat: 25.0522, lng: 121.5203 }}
              defaultZoom={14}
              gestureHandling={"greedy"}
              disableDefaultUI={false}
              mapId={import.meta.env.VITE_GOOGLE_MAP_ID}  // IMPORTANT
            >
              <FitAndFly lots={validLots} flyTo={flyTo} />

              {validLots.map((l) => (
                <AdvancedMarker
                  key={l.lotId}
                  position={{ lat: l.lat, lng: l.lng }}
                  onClick={() => setActive(l)}
                />
              ))}

              {active && (
                <InfoWindow
                  position={{ lat: active.lat, lng: active.lng }}
                  onCloseClick={() => setActive(null)}
                >
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
          </APIProvider>
        </div>
      </div>
    </div>
  );
}
