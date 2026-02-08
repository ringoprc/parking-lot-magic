// frontend/src/App.jsx
import { useMemo, useRef, useState } from "react";
import { useLots } from "./hooks/useLots";
import { haversineMeters } from "./utils/geo";

import { APIProvider } from "@vis.gl/react-google-maps";

import LotsSidebar from "./components/LotsSidebar";
import MobileLotsBar from "./components/MobileLotsBar";
import MobileLotsOverlay from "./components/MobileLotsOverlay";
import ParkingMap from "./components/ParkingMap";

import logo from "./assets/logo4.png";

import "./App.css";

export default function App() {

  const [active, setActive] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const apiBase = import.meta.env.VITE_API_BASE || "";

  const flyToRef = useRef(null);
  const [focus, setFocus] = useState(null); // { lat, lng, viewport? }
  const [searchCenter, setSearchCenter] = useState(null); // { lat, lng }
  const [queryCenter, setQueryCenter] = useState({ lat: 25.0522, lng: 121.5203 }); // initial

  const { lots } = useLots({
    apiBase,
    center: queryCenter,     // {lat,lng}
    radiusM: 2500,           // pick a default (e.g. 2.5km)
    pollMs: 15000,
  });

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

  const displayedLots = useMemo(() => {
    if (!searchCenter) return validLots;

    const withDist = validLots
      .map((l) => ({
        ...l,
        _dist: haversineMeters(searchCenter, { lat: l.lat, lng: l.lng }),
      }))
      .sort((a, b) => a._dist - b._dist);

    // show closest ~30 (tweak as you like)
    return withDist.slice(0, 30);
  }, [validLots, searchCenter]);

  function handlePickPlace(p) {
    // 1) move map (smoothly) — your ParkingMap already supports focus/fit viewport
    setFocus({
      lat: p.lat,
      lng: p.lng,
      zoom: 15
    });

    // 2) use this point to sort nearest lots in the sidebar
    setSearchCenter({ lat: p.lat, lng: p.lng });
    setQueryCenter({ lat: p.lat, lng: p.lng });
  }

  return (
    <APIProvider
      apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
      libraries={["places", "marker"]}
    >
      <div className="app-root">

        {/* Top Logo Bar */}
        <div className="title-bar">
          <div className="title-bar-inner">
            <img src={logo} alt="logo" className="title-bar-logo-img" />
            <div className="title">停車急管家</div>
          </div>
        </div>

        {/* Mobile-only expandable lots bar (row under title) */}
        <div>
          <MobileLotsBar
            count={displayedLots.length}
            open={mobileMenuOpen}
            onToggle={() => setMobileMenuOpen((v) => !v)}
          />
          <MobileLotsOverlay
            open={mobileMenuOpen}
            lots={displayedLots}
            active={active}
            onPick={(p) => {
              handlePickPlace(p);
            }}
            onSelect={(l) => {
              setActive(l);
              flyToRef.current?.({ lat: l.lat, lng: l.lng });
              setMobileMenuOpen(false);
            }}
          />
        </div>

        <div className="content">
          {/* Left list */}
          <LotsSidebar
            lots={displayedLots}
            active={active}
            onPick={handlePickPlace}
            onSelect={(l) => {
              setActive(l);
              flyToRef.current?.({ lat: l.lat, lng: l.lng });
              setMobileMenuOpen(false);
            }}
          />

          {/* Map */}
          <ParkingMap
            lots={validLots}       // map should still show all lots you have
            active={active}
            setActive={setActive}
            flyToRef={flyToRef}
            focus={focus}
          />
        </div>
      </div>
    </APIProvider>
  );
}


