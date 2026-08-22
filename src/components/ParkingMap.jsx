// frontend/src/components/ParkingMap.jsx
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  getAvailabilityLongLabel,
  getAvailabilityPinPresentation,
  isBooleanAvailability,
} from "../utils/availability";

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

function VacancyPin({ lot, pulse }) {
  const { bg, border, glyph, label } = getAvailabilityPinPresentation(lot);

  return (
    <div
      className={
        "vl-pin vl-pin--num " +
        (isBooleanAvailability(lot) ? "vl-pin--boolean " : "") +
        (pulse ? "pulse" : "")
      }
      aria-label={`${lot?.name || "停車場"}：${getAvailabilityLongLabel(lot)}`}
      style={{
        "--pin-bg": bg,
        borderColor: border,
        color: glyph,
      }}
    >
      {pulse ? (
        <>
          <div className="vl-pin-pulse" />
          <div className="vl-pin-num">{label}</div>
        </>
      ) : (
        <div className="vl-pin-num">{label}</div>
      )}
    </div>

  );
}

const MAX_RENDERED_MARKERS_MOBILE = 150;
const MAX_RENDERED_MARKERS_DESKTOP = 250;
const MARKER_POOL_BATCH_SIZE = 1;
const MARKER_CANDIDATE_PADDING_RATIO = 0.15;
const MARKER_RETENTION_PADDING_RATIO = 0.75;

function isLngInside(lng, west, east) {
  return west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;
}

function getPaddedBounds(viewport, paddingRatio) {
  const latPadding =
    Math.abs(viewport.north - viewport.south) * paddingRatio;
  const lngPadding =
    Math.abs(viewport.east - viewport.west) * paddingRatio;

  return {
    north: viewport.north + latPadding,
    south: viewport.south - latPadding,
    east: viewport.east + lngPadding,
    west: viewport.west - lngPadding,
  };
}

function isLotInsideBounds(lot, bounds) {
  return (
    Number.isFinite(lot.lat) &&
    Number.isFinite(lot.lng) &&
    lot.lat >= bounds.south &&
    lot.lat <= bounds.north &&
    isLngInside(lot.lng, bounds.west, bounds.east)
  );
}

function buildMarkerPool(lots, active, viewport, previousPool, markerLimit) {
  const sourceLots = [...(lots || [])];

  if (
    active?.lotId &&
    Number.isFinite(active.lat) &&
    Number.isFinite(active.lng) &&
    !sourceLots.some((lot) => lot.lotId === active.lotId)
  ) {
    sourceLots.push(active);
  }

  const lotsById = new globalThis.Map(
    sourceLots.map((lot) => [lot.lotId, lot])
  );
  const retentionBounds = getPaddedBounds(
    viewport,
    MARKER_RETENTION_PADDING_RATIO
  );
  const candidateBounds = getPaddedBounds(
    viewport,
    MARKER_CANDIDATE_PADDING_RATIO
  );

  // Lots near the current visual center always get first priority. This keeps
  // retained off-screen markers from consuming every slot after a long pan.
  const candidates = sourceLots
    .filter(
      (lot) => isLotInsideBounds(lot, candidateBounds)
    )
    .sort((a, b) => {
      const aLat = a.lat - viewport.centerLat;
      const aLng = a.lng - viewport.centerLng;
      const bLat = b.lat - viewport.centerLat;
      const bLng = b.lng - viewport.centerLng;
      return aLat * aLat + aLng * aLng - (bLat * bLat + bLng * bLng);
    });

  const nextPool = candidates.slice(0, markerLimit);
  const selectedIds = new Set(nextPool.map((lot) => lot.lotId));

  // Retention is now secondary: it fills only spare capacity when the current
  // area contains fewer lots than the cap. Object references are refreshed so
  // polling can still update vacancy presentation.
  const retainedLots = previousPool
    .map((lot) => lotsById.get(lot.lotId))
    .filter(
      (lot) =>
        lot &&
        !selectedIds.has(lot.lotId) &&
        isLotInsideBounds(lot, retentionBounds)
    );

  for (const lot of retainedLots) {
    if (nextPool.length >= markerLimit) break;
    nextPool.push(lot);
    selectedIds.add(lot.lotId);
  }

  if (
    active?.lotId &&
    Number.isFinite(active.lat) &&
    Number.isFinite(active.lng) &&
    !selectedIds.has(active.lotId)
  ) {
    if (nextPool.length >= markerLimit) nextPool.pop();
    nextPool.push(lotsById.get(active.lotId) || active);
  }

  return nextPool;
}

const ParkingMarker = memo(function ParkingMarker({
  lot,
  pulse,
  setActive,
  triggerLotPulse,
  flyToRef,
  isMobile,
}) {
  const map = useMap();

  // Keep the LatLngLiteral identity stable while the viewport changes. Passing a
  // fresh object makes AdvancedMarker assign `marker.position` again, which can
  // briefly repaint every marker after an otherwise harmless map pan.
  const position = useMemo(
    () => ({ lat: lot.lat, lng: lot.lng }),
    [lot.lat, lot.lng]
  );

  const handleClick = useCallback(() => {
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
  }, [flyToRef, isMobile, lot, map, setActive, triggerLotPulse]);

  return (
    <AdvancedMarker position={position} onClick={handleClick}>
      <VacancyPin lot={lot} pulse={pulse} />
    </AdvancedMarker>
  );
});

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
  const markerLimit = isMobile
    ? MAX_RENDERED_MARKERS_MOBILE
    : MAX_RENDERED_MARKERS_DESKTOP;
  const [renderedLots, setRenderedLots] = useState([]);
  const renderedLotsRef = useRef([]);
  const targetLotsRef = useRef([]);
  const poolFrameRef = useRef(null);
  const runPoolStepRef = useRef(null);
  const lastViewportRef = useRef(null);
  const lotsRef = useRef(lots);
  const activeRef = useRef(active);
  const markerLimitRef = useRef(markerLimit);

  useEffect(() => {
    lotsRef.current = lots;
    activeRef.current = active;
    markerLimitRef.current = markerLimit;
  }, [active, lots, markerLimit]);

  const schedulePoolStep = useCallback(() => {
    if (poolFrameRef.current != null) return;

    poolFrameRef.current = window.requestAnimationFrame(() => {
      poolFrameRef.current = null;
      runPoolStepRef.current?.();
    });
  }, []);

  const setTargetLots = useCallback(
    (nextTarget) => {
      targetLotsRef.current = nextTarget;
      schedulePoolStep();
    },
    [schedulePoolStep]
  );

  const runPoolStep = useCallback(() => {
    const current = renderedLotsRef.current;
    const target = targetLotsRef.current;
    const targetById = new globalThis.Map(
      target.map((lot) => [lot.lotId, lot])
    );
    const targetIds = new Set(targetById.keys());

    const removals = current
      .filter((lot) => !targetIds.has(lot.lotId))
      .slice(0, MARKER_POOL_BATCH_SIZE);
    const removalIds = new Set(removals.map((lot) => lot.lotId));

    let next = current
      .filter((lot) => !removalIds.has(lot.lotId))
      .map((lot) => targetById.get(lot.lotId) || lot);
    const nextIds = new Set(next.map((lot) => lot.lotId));
    const additions = target
      .filter((lot) => !nextIds.has(lot.lotId))
      .slice(0, MARKER_POOL_BATCH_SIZE);

    next = [...next, ...additions];

    const membershipChanged =
      removals.length > 0 || additions.length > 0;
    const dataChanged =
      next.length === current.length &&
      next.some((lot, index) => lot !== current[index]);

    if (membershipChanged || dataChanged) {
      renderedLotsRef.current = next;
      setRenderedLots(next);
    }

    const nextIdsAfterStep = new Set(next.map((lot) => lot.lotId));
    const reachedTarget =
      next.length === target.length &&
      target.every((lot) => nextIdsAfterStep.has(lot.lotId));

    if (!reachedTarget) schedulePoolStep();
  }, [schedulePoolStep]);

  useEffect(() => {
    runPoolStepRef.current = runPoolStep;

    return () => {
      runPoolStepRef.current = null;
    };
  }, [runPoolStep]);

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

      const previousViewport = lastViewportRef.current;
      lastViewportRef.current = nextViewport;

      // A zoom must never alter marker membership. Existing markers already
      // cover the zoom target, and keeping them mounted prevents the bulk
      // AdvancedMarker repaint that caused the original blink.
      const zoomChanged =
        previousViewport &&
        Math.abs(previousViewport.zoom - nextViewport.zoom) > 0.001;

      if (zoomChanged) {
        targetLotsRef.current = renderedLotsRef.current;
      } else {
        setTargetLots(
          buildMarkerPool(
            lotsRef.current,
            activeRef.current,
            nextViewport,
            renderedLotsRef.current,
            markerLimitRef.current
          )
        );
      }

      onViewportChange?.(nextViewport);
    };

    // Render only after Google Maps has real bounds, then update after each pan/zoom.
    const frameId = window.requestAnimationFrame(updateViewport);
    const idleListener = map.addListener("idle", updateViewport);
    const zoomListener = map.addListener("zoom_changed", () => {
      // Freeze any in-progress pan reconciliation as soon as zooming starts.
      targetLotsRef.current = renderedLotsRef.current;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      idleListener?.remove?.();
      zoomListener?.remove?.();
    };
  }, [map, onViewportChange, setTargetLots]);

  useEffect(() => {
    const viewport = lastViewportRef.current;
    if (!viewport) return;

    setTargetLots(
      buildMarkerPool(
        lots,
        active,
        viewport,
        renderedLotsRef.current,
        markerLimit
      )
    );
  }, [active, lots, markerLimit, setTargetLots]);

  useEffect(() => {
    return () => {
      if (poolFrameRef.current != null) {
        window.cancelAnimationFrame(poolFrameRef.current);
      }
    };
  }, []);

  return useMemo(
    () =>
      renderedLots.map((lot) => (
        <ParkingMarker
          key={lot.lotId}
          lot={lot}
          pulse={lot.lotId === pulseLotId}
          setActive={setActive}
          triggerLotPulse={triggerLotPulse}
          flyToRef={flyToRef}
          isMobile={isMobile}
        />
      )),
    [
      flyToRef,
      isMobile,
      pulseLotId,
      renderedLots,
      setActive,
      triggerLotPulse,
    ]
  );
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
