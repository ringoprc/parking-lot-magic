// frontend/src/components/ParkingMap.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map,
  AdvancedMarker,
  useMap,
} from "@vis.gl/react-google-maps";

import Spinner from "react-bootstrap/Spinner";
import { FaCircle } from "react-icons/fa";
import { TiLocationArrow } from "react-icons/ti";

import ParkingLotInfoWindow from "./ParkingLotInfoWindow";
import LotBottomSheet from "./LotBottomSheet";

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

function FitAndFly({ flyToRef }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    flyToRef.current = ({ lat, lng, zoom }) => {
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

            if ((dir > 0 && z >= target) || (dir < 0 && z <= target)) {
              map.setZoom(target);
              window.clearInterval(id);
              return;
            }

            map.setZoom(z);
          }, 80);

          window.setTimeout(() => window.clearInterval(id), 1500);
        }
      }
    };
  }, [map, flyToRef]);

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


const MAX_RENDERED_MARKERS_MOBILE = 150;
const MAX_RENDERED_MARKERS_DESKTOP = 250;

const VIEWPORT_PADDING_RATIO = 0.15;

function isLngInside(lng, west, east) {
  // Normal case. The second branch also supports bounds crossing the date line.
  return west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;
}

function VisibleParkingMarkers({
  lots,
  active,
  setActive,
  pulseLotId,
  triggerLotPulse,
  flyToRef,
  isMobile,
  onViewportChange,
}) {
  const map = useMap();
  const [viewport, setViewport] = useState(null);

  const markerLimit = isMobile
    ? MAX_RENDERED_MARKERS_MOBILE
    : MAX_RENDERED_MARKERS_DESKTOP;

  useEffect(() => {
    if (!map) return;

    const updateViewport = () => {
      const bounds = map.getBounds?.();
      const center = map.getCenter?.();
      const zoom = map.getZoom?.();
      if (!bounds || !center || !Number.isFinite(zoom)) return;

      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();

      const nextViewport = {
        north: ne.lat(),
        east: ne.lng(),
        south: sw.lat(),
        west: sw.lng(),
        centerLat: center.lat(),
        centerLng: center.lng(),
        zoom,
      };

      setViewport(nextViewport);
      onViewportChange?.(nextViewport);
    };

    // Render only after Google Maps has real bounds, then update after each pan/zoom.
    const frameId = window.requestAnimationFrame(updateViewport);
    const idleListener = map.addListener("idle", updateViewport);

    return () => {
      window.cancelAnimationFrame(frameId);
      idleListener?.remove?.();
    };
  }, [map, onViewportChange]);

  const visibleLots = useMemo(() => {
    if (!viewport) return active ? [active] : [];

    const latPadding =
      Math.abs(viewport.north - viewport.south) * VIEWPORT_PADDING_RATIO;
    const lngPadding =
      Math.abs(viewport.east - viewport.west) * VIEWPORT_PADDING_RATIO;

    const north = viewport.north + latPadding;
    const south = viewport.south - latPadding;
    const east = viewport.east + lngPadding;
    const west = viewport.west - lngPadding;

    const inView = (lots || []).filter((lot) => {
      if (!Number.isFinite(lot.lat) || !Number.isFinite(lot.lng)) return false;
      return (
        lot.lat >= south &&
        lot.lat <= north &&
        isLngInside(lot.lng, west, east)
      );
    });

    // At a wide zoom, even the viewport can contain hundreds of lots.
    // Keep the closest markers to the camera center instead of mounting all DOM nodes.
    if (inView.length > markerLimit) {
      inView.sort((a, b) => {
        const aLat = a.lat - viewport.centerLat;
        const aLng = a.lng - viewport.centerLng;
        const bLat = b.lat - viewport.centerLat;
        const bLng = b.lng - viewport.centerLng;
        return aLat * aLat + aLng * aLng - (bLat * bLat + bLng * bLng);
      });
      inView.length = markerLimit;
    }

    if (
      active?.lotId &&
      Number.isFinite(active.lat) &&
      Number.isFinite(active.lng) &&
      !inView.some((lot) => lot.lotId === active.lotId)
    ) {
      if (inView.length >= markerLimit) inView.pop();
      inView.push(active);
    }

    return inView;
  }, [lots, viewport, active, markerLimit]);

  return visibleLots.map((lot) => (
    <AdvancedMarker
      key={lot.lotId}
      position={{ lat: lot.lat, lng: lot.lng }}
      onClick={() => {
        setActive?.(lot);
        triggerLotPulse?.(lot.lotId);

        const zRaw = map?.getZoom?.();
        const curZ = Number.isFinite(zRaw) ? zRaw : null;
        const shouldZoomIn = curZ == null || curZ < 15;

        const z = curZ ?? 16;
        const baseOffset = 0.003;
        const offset = baseOffset * Math.pow(curZ < 16 ? 1 : 2, 16 - z);
        const flyToOffsetZoom = isMobile ? -offset : offset;

        flyToRef.current?.({
          lat: lot.lat + flyToOffsetZoom,
          lng: lot.lng,
          ...(shouldZoomIn ? { zoom: 16 } : {}),
        });
      }}
    >
      <VacancyPin
        vacancy={lot.vacancy}
        active={active?.lotId === lot.lotId}
        pulse={lot.lotId === pulseLotId}
      />
    </AdvancedMarker>
  ));
}


export default function ParkingMap({
  lots,
  active,
  setActive,
  lastSheetFetchAt,
  lastFrontendFetchAt,
  flyToRef,
  focus,
  setFocus,
  pulseLotId,
  triggerLotPulse,
  locatingMe,              // boolean from parent
  requestMyLocation,       // function from parent (does geolocation)
  myPos,
  myAcc,
  onViewportChange,
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
        <FitAndFly flyToRef={flyToRef} />

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

        <VisibleParkingMarkers
          lots={lots}
          active={active}
          setActive={setActive}
          pulseLotId={pulseLotId}
          triggerLotPulse={triggerLotPulse}
          flyToRef={flyToRef}
          isMobile={isMobile}
          onViewportChange={onViewportChange}
        />

        {!isMobile && active && (
          <ParkingLotInfoWindow
            active={active}
            setActive={setActive}
          />
        )}

      </Map>

      {/* Locate control (bottom-right) */}
      <button
        type="button"
        className={"map-locate-btn " 
          + (mapReady ? "ready " : " ")
          + (myPos?.lat != null && myPos?.lng != null ? "active" : " ")
          + (locatingMe ? "locating " : " ")
        }
        onClick={() => requestMyLocation?.()}
        disabled={!!locatingMe}
        aria-label="定位到我的位置"
      >
        {locatingMe ? (
          <Spinner className="map-locate-spinner" animation="grow" role="status" size="sm" />
        ) : (
          <TiLocationArrow size={32} />
        )}
      </button>

      {isMobile && (
        <LotBottomSheet
          active={active}
          onClose={() => setActive(null)}
          lastSheetFetchAt={lastSheetFetchAt}
          lastFrontendFetchAt={lastFrontendFetchAt}
        />
      )}
    </div>
  );
}


