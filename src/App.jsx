// frontend/src/App.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLots } from "./hooks/useLots";
import { haversineMeters } from "./utils/geo";

import { Toaster } from "react-hot-toast";
import { APIProvider } from "@vis.gl/react-google-maps";

import LotsSidebar from "./components/LotsSidebar";
import MobileLotsBar from "./components/MobileLotsBar";
import MobileLotsOverlay from "./components/MobileLotsOverlay";
import ParkingMap from "./components/ParkingMap";

import Spinner from "react-bootstrap/Spinner";
import { FaCheck } from "react-icons/fa6";

import AdminLotsPage from "./pages/AdminLotsPage";
import AdminDevicesPage from "./pages/AdminDevicesPage/AdminDevicesPage";
import AdminLinkagePage from "./pages/AdminLinkagePage";
import AdminLotAdsPage from "./pages/AdminLotAdsPage";
import AdminWorkerStatusPage from "./pages/AdminWorkerStatusPage";

import { useMyLocationAction } from "./hooks/useMyLocationAction";
import { useMediaQuery } from "./hooks/useMediaQuery";

import logo from "./assets/logo4.png";
import DigitOcrTest from "./pages/DigitOcrTest";

import "./App.css";

function AdminMenuPage() {
  const adminItems = [
    {
      title: "停車場清單管理",
      description: "新增、編輯、檢查停車場基本資料。",
      href: "?admin=lots",
      badge: "Lots",
    },
    {
      title: "設備與 AI 空位管理",
      description: "查看手機設備、拍攝狀態、AI 辨識空位與拍照秒數設定。",
      href: "?admin=devices",
      badge: "Devices",
    },
    {
      title: "停車場設備連結",
      description: "管理停車場與拍攝設備之間的對應關係。",
      href: "?admin=link",
      badge: "Linkage",
    },
    {
      title: "商家與廣告圖片管理",
      description: "上傳與管理 bottom sheet、導航廣告、優惠券圖片。",
      href: "?admin=ads",
      badge: "Ads",
    },
    {
      title: "AI 辨識用設備管理",
      description: "管理用於搭載 AI 模型並辨識影像的機器",
      href: "?admin=workers",
      badge: "Workers",
    },
    {
      title: "OCR 測試工具",
      description: "測試數字辨識流程與模型輸出。",
      href: "?ocr=1",
      badge: "Tool",
    },
  ];

  return (
    <div className="admin-menu-page">
      <div className="admin-menu-shell">
        <div className="admin-menu-topbar">
          <a className="admin-menu-brand" href="/">
            <img src={logo} alt="ParkingJi" className="admin-menu-logo" />
            <div>
              <div className="admin-menu-brand-title">停車急管家</div>
              <div className="admin-menu-brand-subtitle">ParkingJi Admin</div>
            </div>
          </a>

          <a className="admin-menu-map-link" href="/">
            回到地圖
          </a>
        </div>

        <div className="admin-menu-hero">
          <div>
            <div className="admin-menu-kicker">後台管理中心</div>
            <h1>目前已建立的管理功能</h1>
            <p>
              之後新增後台頁面時，只要把入口加到這裡，就不用再記得每一組網址參數。
            </p>
          </div>
        </div>

        <div className="admin-menu-grid">
          {adminItems.map((item) => (
            <a className="admin-menu-card" href={item.href} key={item.href}>
              <div className="admin-menu-card-head">
                <span className="admin-menu-card-badge">{item.badge}</span>
                <span className="admin-menu-card-arrow">›</span>
              </div>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

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

function formatDist(m) {
  if (m == null || !Number.isFinite(m)) return "";
  if (m < 1000) return `${Math.round(m)} 公尺`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} 公里`;
}

function isLngInside(lng, west, east) {
  // Also handles bounds crossing the international date line.
  return west <= east
    ? lng >= west && lng <= east
    : lng >= west || lng <= east;
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

  const [mapViewport, setMapViewport] = useState(null);

  const [myPos, setMyPos] = useState(null); // {lat,lng}
  const [myAcc, setMyAcc] = useState(null); // meters
  const afterLocateRef = useRef(null);

  //-----------------------------
  // Desktop Sidebar resize
  //-----------------------------
  const SIDEBAR_MIN = 280;
  const SIDEBAR_MAX = 920;

  const [sidebarW, setSidebarW] = useState(() => {
    const v = Number(localStorage.getItem("sidebarW"));
    return Number.isFinite(v) ? v : 360;
  });
  const [sbDragging, setSbDragging] = useState(false);

  const sbStartXRef = useRef(0);
  const sbStartWRef = useRef(0);

  function clampSidebarW(w) {
    return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, w));
  }

  function onSbDown(e) {
    // mouse: only left button
    if (e.pointerType === "mouse" && e.button !== 0) return;

    setSbDragging(true);
    sbStartXRef.current = e.clientX;
    sbStartWRef.current = sidebarW;

    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onSbMove(e) {
    if (!sbDragging) return;
    const dx = e.clientX - sbStartXRef.current;
    setSidebarW(clampSidebarW(sbStartWRef.current + dx));
  }

  function onSbUp() {
    if (!sbDragging) return;
    setSbDragging(false);
    localStorage.setItem("sidebarW", String(sidebarW));
  }

  //-----------------------------
  // Secret APK
  //-----------------------------
  const tapTimesRef = useRef([]); // timestamps (ms)

  const [apkModalOpen, setApkModalOpen] = useState(false);
  const [apkPw, setApkPw] = useState("");
  const [apkBusy, setApkBusy] = useState(false);
  const [apkErr, setApkErr] = useState("");

  function onLogoTap() {
    const now = Date.now();
    const tenSecAgo = now - 10_000;

    const arr = tapTimesRef.current.filter((t) => t >= tenSecAgo);
    arr.push(now);
    tapTimesRef.current = arr;

    if (arr.length >= 7) {
      tapTimesRef.current = [];
      setApkErr("");
      setApkPw("");
      setApkModalOpen(true);
    }
  }

  async function confirmApkPw() {
    if (apkBusy) return;
    setApkBusy(true);
    setApkErr("");

    try {
      const r = await fetch(`${apiBase}/download/get-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: apkPw }),
      });

      const data = await r.json().catch(() => null);

      if (!r.ok || !data?.ok || !data?.url) {
        setApkErr("ヽ(`Д´)ノ");
        return;
      }

      setApkModalOpen(false);

      // Trigger download
      window.location.assign(data.url);
    } catch (e) {
      setApkErr("Network error");
    } finally {
      setApkBusy(false);
    }
  }


  //-----------------------------
  // Load lots
  //-----------------------------

  const RADIUS_M = 2000;
  const { lots, meta, lastFrontendFetchAt, reload } = useLots({
    apiBase,
    district: null,
    center: queryCenter,
    radiusM: RADIUS_M,
    /*pollMs: 15000,*/
    pollMs: 150000,
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

  // Keep `active` fresh when lots are reloaded (polling)
  // Otherwise BottomSheet keeps showing the old object.
  useEffect(() => {
    if (!active?.lotId) return;

    const fresh = validLots.find((l) => l.lotId === active.lotId);
    if (!fresh) return;

    setActive((prev) => {
      if (!prev || prev.lotId !== fresh.lotId) return prev;
      if (prev === fresh) return prev;

      // preserve computed fields like _dist if you selected from displayedLots
      if (prev._dist != null && fresh._dist == null) return { ...fresh, _dist: prev._dist };
      return fresh;
    });
  }, [validLots, active?.lotId]);


  const { locating: locatingMe, requestMyLocation } = useMyLocationAction({
    onSuccess: ({ lat, lng, accuracy }) => {
      setMyPos({ lat, lng });
      setMyAcc(accuracy);

      // run one-shot post-locate action (if any)
      afterLocateRef.current?.({ lat, lng, accuracy });
      afterLocateRef.current = null;
    },
  });

  function requestMyLocationForSearch() {
    afterLocateRef.current = ({ lat, lng }) => {
      handlePickPlace({
        name: "我的位置",
        address: "",
        lat,
        lng,
        viewport: null,
        kind: "my_location",
      });
    };
    requestMyLocation();
  }

  function requestMyLocationForMapFly() {
    afterLocateRef.current = ({ lat, lng }) => {
      flyToRef.current?.({ lat, lng, zoom: 16 });
      setFocus({ name: "我的位置", lat, lng, kind: "my_location" });
    };
    requestMyLocation();
  }

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

  const visibleLots = useMemo(() => {
    // Before Google Maps reports its first real viewport,
    // temporarily fall back to the complete valid lot list.
    if (!mapViewport) return validLots;

    const {
      north,
      south,
      east,
      west,
    } = mapViewport;

    return validLots.filter((lot) => {
      return (
        lot.lat >= south &&
        lot.lat <= north &&
        isLngInside(lot.lng, west, east)
      );
    });
  }, [validLots, mapViewport]);

  const displayedLots = useMemo(() => {
    const mapCenter =
      mapViewport?.centerLat != null && mapViewport?.centerLng != null
        ? {
            lat: mapViewport.centerLat,
            lng: mapViewport.centerLng,
          }
        : null;

    // When searching, order by distance from the searched place.
    // Otherwise, order by distance from the middle of the current map.
    const orderCenter = searchCenter ?? mapCenter;

    const ordered = visibleLots
      .map((lot) => {
        const distance = orderCenter
          ? haversineMeters(orderCenter, {
              lat: lot.lat,
              lng: lot.lng,
            })
          : 0;

        return {
          lot,
          distance,
        };
      })
      .sort((a, b) => {
        const distanceDifference = a.distance - b.distance;

        if (distanceDifference !== 0) {
          return distanceDifference;
        }

        return String(a.lot.lotId).localeCompare(
          String(b.lot.lotId)
        );
      });

    return ordered.slice(0, 30).map(({ lot, distance }) => {
      // LotsList uses _dist only when a searched location is active.
      if (searchCenter) {
        return {
          ...lot,
          _dist: distance,
        };
      }

      return lot;
    });
  }, [
    visibleLots,
    searchCenter,
    mapViewport?.centerLat,
    mapViewport?.centerLng,
  ]);

  const listTitle = useMemo(() => {
    const visibleCount = visibleLots.length;

    const countText =
      displayedLots.length < visibleCount
        ? `${displayedLots.length}/${visibleCount}`
        : String(visibleCount);

    if (!searchCenter || !focus?.name) {
      return `目前地圖範圍內停車場 (${countText})`;
    }

    const km = RADIUS_M / 1000;
    const kmText = Number.isInteger(km)
      ? String(km)
      : km.toFixed(1);

    return `距離 [ ${focus.name} ] ${kmText}km 內・目前地圖範圍 (${countText})`;
  }, [
    visibleLots.length,
    displayedLots.length,
    searchCenter,
    focus?.name,
    RADIUS_M,
  ]);

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

  const isMobile = useMediaQuery("(max-width: 900px)");
  const flyToOffset = isMobile ? -0.002 : 0.002;



  //-----------------------------
  // Routes
  //-----------------------------
  const searchParams = new URLSearchParams(window.location.search);

  const showOcr = searchParams.get("ocr") === "1";

  const adminRoute = searchParams.get("admin");
  const showAdminMenu = adminRoute === "1";
  const showAdminLots = adminRoute === "lots" || searchParams.get("lots") === "1";
  const showDevices = adminRoute === "devices" || searchParams.get("devices") === "1";
  const showLinkage = adminRoute === "link" || searchParams.get("link") === "1";
  const showAdsManage = adminRoute === "ads" || searchParams.get("ads") === "1";
  const showWorkers = adminRoute === "workers" || searchParams.get("workers") === "1";

  let page = null;
  if (showOcr) page = <DigitOcrTest />;
  else if (showAdminLots) page = <AdminLotsPage apiBase={apiBase} />;
  else if (showDevices) {
    page = (
      <APIProvider
        apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
        libraries={["places", "marker"]}
      >
        <AdminDevicesPage apiBase={apiBase} />
      </APIProvider>
    );
  }
  else if (showLinkage) page = <AdminLinkagePage apiBase={apiBase} />;
  else if (showAdsManage) page = <AdminLotAdsPage apiBase={apiBase} />;
  else if (showWorkers) page = <AdminWorkerStatusPage apiBase={apiBase} />;
  else if (showAdminMenu) page = <AdminMenuPage />;
  else page = (
    <APIProvider
      apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
      libraries={["places", "marker"]}
    >
      <div className="app-root">

        <div className="title-bar">
          <div className="title-bar-inner">
            <div className="title-bar-left">
              <img
                src={logo}
                alt="logo"
                className="title-bar-logo-img"
                onClick={onLogoTap}
              />

              <div>
                <div className="title">
                  <span style={{ marginLeft: "6px" }}>停車</span>
                  <span className="title-hightlight-span">急</span>
                  <span style={{ marginRight: "5px" }}>管家</span>
                  <span style={{ fontSize: "18px" }}>Parking</span>
                  <span className="title-hightlight-span"
                    style={{ fontSize: "20px", color: "#f0c35b" }}
                  >Ji</span>
                  <span style={{ fontSize: "13px" }}>.com</span>
                </div>
                <div className="subtitle-div">
                  <span className="subtitle">30 秒更新一次的停車場空位資訊</span>
                </div>
              </div>

            </div>

            <a className="title-bar-admin-link" href="?admin=1">
              管理後台
            </a>
          </div>
        </div>

        {apkModalOpen && (
          <div
            onClick={() => setApkModalOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(420px, 92vw)",
                background: "#fff",
                borderRadius: "14px",
                padding: "16px",
                boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
              }}
            >
              <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "10px" }}>
                ...?
              </div>

              <input
                value={apkPw}
                onChange={(e) => setApkPw(e.target.value)}
                type="password"
                placeholder="Enter"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid #ddd",
                  outline: "none",
                  fontSize: "16px",
                }}
              />

              {apkErr && (
                <div style={{ marginTop: "8px", color: "#c0392b", fontSize: "14px",
                    fontWeight: "500"
                }}>
                  {apkErr}
                </div>
              )}

              <button className="app-sect-confirm-btn"
                onClick={confirmApkPw}
                disabled={apkBusy || !apkPw}
                style={{
                  cursor: apkBusy ? "default" : "pointer",
                  opacity: apkBusy || !apkPw ? 0.6 : 1,
                }}
              >
                {apkBusy ? (
                  <>
                    <Spinner className="app-custom-spinner" size="sm" />
                    <span>Checking</span>
                  </>
                  ) : (
                  <span>Confirm</span>
                )}
              </button>
            </div>
          </div>
        )}

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
            locatingMe={locatingMe}
            requestMyLocation={requestMyLocationForSearch}
            myPos={myPos}
            showDistance={!!searchCenter}
            formatDist={formatDist}
            focus={focus}
          />
        </div>

        <div
          className={`content ${sbDragging ? "sb-dragging" : ""}`}
          style={{ gridTemplateColumns: isMobile ? `1fr` : `${sidebarW}px 1fr` }}
        >
          {/* Left Sidebar (desktop) */}
          <div className="sidebar-wrap">
            <LotsSidebar
              title={listTitle}
              lots={displayedLots}
              setOpen={setMobileMenuOpen}
              active={active}
              onSelect={(l) => {
                setActive(l);
                triggerLotPulse(l.lotId);
                flyToRef.current?.({ lat: l.lat + flyToOffset, lng: l.lng, zoom: 16 });
                setMobileMenuOpen(false);
              }}
              onPick={handlePickPlace}
              onClear={handleClearPick}
              locatingMe={locatingMe}
              requestMyLocation={requestMyLocationForSearch}
              myPos={myPos}
              showDistance={!!searchCenter}
              formatDist={formatDist}
              focus={focus}
            />

            {/* resize handle */}
            <div
              className="sidebar-resize-handle"
              onPointerDown={onSbDown}
              onPointerMove={onSbMove}
              onPointerUp={onSbUp}
              onPointerCancel={onSbUp}
            >
              <div className="sidebar-resize-handle-inner"></div>
            </div>
          </div>

          {/* Map */}
          <div className="map-wrap">
            <ParkingMap
              lots={validLots}
              onViewportChange={setMapViewport}
              active={active}
              setActive={setActive}
              lastSheetFetchAt={meta?.lastSheetFetchAt}
              lastFrontendFetchAt={lastFrontendFetchAt}
              flyToRef={flyToRef}
              focus={focus}
              setFocus={setFocus}
              pulseLotId={pulseLotId}
              triggerLotPulse={triggerLotPulse}
              locatingMe={locatingMe}
              requestMyLocation={requestMyLocationForMapFly}
              myPos={myPos}
              myAcc={myAcc}
            />
            {sbDragging && <div className="sb-drag-overlay" />}
          </div>

        </div>
      </div>
      <Toaster position="top-center" toastOptions={{ duration: 2000 }} />
    </APIProvider>
  );

  return (
    <>
      {page}
      <Toaster position="top-center" toastOptions={{ duration: 2000 }} />
    </>
  );
}


