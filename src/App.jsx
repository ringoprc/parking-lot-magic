// frontend/src/App.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLots } from "./hooks/useLots";
import { haversineMeters } from "./utils/geo";

import { APIProvider } from "@vis.gl/react-google-maps";

import LotsSidebar from "./components/LotsSidebar";
import MobileLotsBar from "./components/MobileLotsBar";
import MobileLotsOverlay from "./components/MobileLotsOverlay";
import ParkingMap from "./components/ParkingMap";

import logo from "./assets/logo4.png";

import "./App.css";

function formatYmdHms(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
}

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
    district: null,
    center: queryCenter,
    radiusM: RADIUS_M,
    pollMs: 15000,
  });

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

  const [pulseLotId, setPulseLotId] = useState(null);
  const pulseTimerRef = useRef(null);

  function triggerLotPulse(lotId, ms = 9999999) {
    setPulseLotId(lotId);
    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => {
      setPulseLotId(null);
      pulseTimerRef.current = null;
    }, ms);
  }

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    };
  }, []);

  const sheetFetchedText = useMemo(() => {
    const s = formatYmdHms(meta?.lastSheetFetchAt);
    return s ? `清單最近更新時間 ${s}` : null;
  }, [meta?.lastSheetFetchAt]);

  const displayedLots = useMemo(() => {
    if (!searchCenter) {
      return [...validLots]
        .sort((a, b) => String(a.lotId).localeCompare(String(b.lotId)))
        .slice(0, 30);
    }

    const withDist = validLots
      .map((l) => ({
        ...l,
        _dist: haversineMeters(searchCenter, { lat: l.lat, lng: l.lng }),
      }))
      .sort((a, b) => {
        const d = a._dist - b._dist;
        if (d !== 0) return d;
        return String(a.lotId).localeCompare(String(b.lotId));
      });

    // show closest ~30 (tweak as you like)
    return withDist.slice(0, 30);
  }, [validLots, searchCenter]);

  const listTitle = useMemo(() => {

    const totalActive = meta?.totalActive ?? displayedLots.length;
    if (!searchCenter || !focus?.name) return `點此搜尋所有停車場 (${totalActive})`;

    const km = (RADIUS_M / 1000);
    const kmText = Number.isInteger(km) ? String(km) : km.toFixed(1);

    const suffix = totalActive != null 
      ? ` (${displayedLots.length}/${totalActive})` 
      : ` (${displayedLots.length})`;
    return `距離 [ ${focus.name} ] ${kmText}km 內${suffix}`;
  }, [searchCenter, focus?.name, displayedLots.length, RADIUS_M, meta]);

  function handleClearPick() {
    setSearchCenter(null);     // 解除 filtered lots
    setFocus(null);            // 地圖上那個搜尋 pin 也拿掉
    setQueryCenter(null);
    // setActive(null);
  }

  function handlePickPlace(p) {
    setActive(null);
    // 1) move map (smoothly) — your ParkingMap already supports focus/fit viewport
    flyToRef.current?.({ lat: p.lat, lng: p.lng, zoom: 15 });
    setFocus({
      name: p.name,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      zoom: 15,
      kind: "search",
    });

    // 2) use this point to sort nearest lots in the sidebar
    setSearchCenter({ lat: p.lat, lng: p.lng });
    setQueryCenter({ lat: p.lat, lng: p.lng });
  }

  const isMobile = window.matchMedia?.("(max-width: 900px)")?.matches ?? false;
  const flyToOffset = isMobile ? -0.002 : 0.002;

  return (
    <APIProvider
      apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
      libraries={["places", "marker"]}
    >
      <div className="app-root">

        <div className="title-bar">
          <div className="title-bar-inner">
            <div className="title-bar-left">
              <img src={logo} alt="logo" className="title-bar-logo-img" />
              <div className="title">停車急管家</div>
            </div>
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
            setOpen={setMobileMenuOpen}
            lots={displayedLots}
            active={active}
            onSelect={(l) => {
              setActive(l);
              triggerLotPulse(l.lotId);
              flyToRef.current?.({ lat: l.lat+flyToOffset, lng: l.lng, zoom: 16 });
              //setFocus({ name: l.name, lat: l.lat, lng: l.lng, zoom: 15, kind: "lot" });
              setMobileMenuOpen(false);
            }}
            onPick={(p) => {
              handlePickPlace(p);
            }}
            onClear={handleClearPick}
            sheetFetchedText={sheetFetchedText}
          />
        </div>

        <div className="content">
          {/* Left list */}
          <LotsSidebar
            title={listTitle}
            lots={displayedLots}
            setOpen={setMobileMenuOpen}
            active={active}
            onSelect={(l) => {
              setActive(l);
              triggerLotPulse(l.lotId);
              flyToRef.current?.({ lat: l.lat+flyToOffset, lng: l.lng, zoom: 16 });
              //setFocus({ name: l.name, lat: l.lat, lng: l.lng, zoom: 15, kind: "lot" });
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
            pulseLotId={pulseLotId}
            triggerLotPulse={triggerLotPulse}
          />
        </div>
      </div>
    </APIProvider>
  );
}


