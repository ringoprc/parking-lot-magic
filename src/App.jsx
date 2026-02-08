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

  const DEFAULT_CENTER = { lat: 25.0522, lng: 121.5203 };

  const [active, setActive] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const apiBase = import.meta.env.VITE_API_BASE || "";

  const flyToRef = useRef(null);
  const [focus, setFocus] = useState(null); // { lat, lng, viewport? }
  const [searchCenter, setSearchCenter] = useState(null); // { lat, lng }
  const [queryCenter, setQueryCenter] = useState(null); // initial

  const RADIUS_M = 2000;
  const { lots, meta, reload } = useLots({
    apiBase,
    district: "中山區",
    center: queryCenter,
    radiusM: RADIUS_M,
    pollMs: 15000,
  });

  console.log('lots:', lots);

  const validLots = useMemo(
    () =>
      lots.filter(
        (l) =>
          typeof l.lat === "number" &&
          typeof l.lng === "number" &&
          typeof l.lotId === "string"
      ),
    [lots]
  );

  console.log('validLots:', validLots);

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

  console.log('displayedLots:', displayedLots);

  const listTitle = useMemo(() => {

    const totalActive = meta?.totalActive ?? displayedLots.length;
    if (!searchCenter || !focus?.name) return `點此搜尋所有停車場 (${totalActive})`;

    const km = (RADIUS_M / 1000);
    const kmText = Number.isInteger(km) ? String(km) : km.toFixed(1);

    const suffix = totalActive != null 
      ? ` (${displayedLots.length}/${totalActive})` 
      : ` (${displayedLots.length})`;
    return `距離 [${focus.name}] ${kmText}km 內${suffix}`;
  }, [searchCenter, focus?.name, displayedLots.length, RADIUS_M, meta]);

  function handleClearPick() {
    setSearchCenter(null);     // ✅ 解除 filtered lots
    setFocus(null);            // ✅ 地圖上那個搜尋 pin 也拿掉
    setQueryCenter(DEFAULT_CENTER); // ✅ 排序/距離基準回中山預設
    // setActive(null); // 可選：要不要順便關掉 info window
  }

  function handlePickPlace(p) {
    // 1) move map (smoothly) — your ParkingMap already supports focus/fit viewport
    setFocus({
      name: p.name,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      zoom: 15,
      kind: "search"
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
            title={listTitle}
            count={displayedLots.length}
            open={mobileMenuOpen}
            onToggle={() => setMobileMenuOpen((v) => !v)}
          />
          <MobileLotsOverlay
            open={mobileMenuOpen}
            lots={displayedLots}
            active={active}
            onSelect={(l) => {
              setActive(l);
              flyToRef.current?.({ lat: l.lat, lng: l.lng });
              setMobileMenuOpen(false);
            }}
            onPick={(p) => {
              handlePickPlace(p);
            }}
            onClear={handleClearPick}
          />
        </div>

        <div className="content">
          {/* Left list */}
          <LotsSidebar
            title={listTitle}
            lots={displayedLots}
            active={active}
            onSelect={(l) => {
              setActive(l);
              flyToRef.current?.({ lat: l.lat, lng: l.lng });
              setMobileMenuOpen(false);
            }}
            onPick={handlePickPlace}
            onClear={handleClearPick}
          />

          {/* Map */}
          <ParkingMap
            lots={validLots}       // map should still show all lots you have
            active={active}
            setActive={setActive}
            flyToRef={flyToRef}
            focus={focus}
            setFocus={setFocus}
          />
        </div>
      </div>
    </APIProvider>
  );
}


