// frontend/src/components/LotBottomSheet.jsx
import { useEffect, useRef, useState } from "react";
import { formatTime, minutesAgo, minSecAgo } from "../utils/time";

import "./LotBottomSheet.css";

export default function LotBottomSheet({ active, onClose }) {
  const sheetRef = useRef(null);

  // snap points (px from bottom). 0 = fully expanded
  const SNAP_PEEK = 140;  // visible height when collapsed
  const SNAP_HALF = 380;  // medium
  const SNAP_FULL = 40;   // almost full (leave small top gap)

  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState(SNAP_PEEK); // current translateY target
  const dragRef = useRef({
    dragging: false,
    startY: 0,
    startSnap: SNAP_PEEK,
  });

  // open sheet when active changes
  useEffect(() => {
    if (!active) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setSnap(SNAP_HALF); // open to half by default
  }, [active]);

  // close helper
  function close() {
    setOpen(false);
    onClose?.();
  }

  // apply transform
  const translateY = open ? `translateY(${snap}px)` : "translateY(100%)";

  function clamp(v, min, max) {
    return Math.max(min, Math.min(v, max));
  }

  function nearestSnap(v) {
    const choices = [SNAP_FULL, SNAP_HALF, SNAP_PEEK];
    let best = choices[0];
    let bestD = Math.abs(v - best);
    for (const c of choices.slice(1)) {
      const d = Math.abs(v - c);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  // drag only on the handle area (not on content)
  function onHandleTouchStart(e) {
    if (!open) return;
    const t = e.touches?.[0];
    if (!t) return;
    dragRef.current.dragging = true;
    dragRef.current.startY = t.clientY;
    dragRef.current.startSnap = snap;
  }

  function onHandleTouchMove(e) {
    if (!dragRef.current.dragging) return;
    const t = e.touches?.[0];
    if (!t) return;
    const dy = t.clientY - dragRef.current.startY;
    const next = clamp(dragRef.current.startSnap + dy, SNAP_FULL, window.innerHeight - 40);
    setSnap(next);
    e.preventDefault(); // prevent page scroll while dragging sheet
  }

  function onHandleTouchEnd() {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;

    // if dragged far down, close
    if (snap > window.innerHeight * 0.65) {
      close();
      return;
    }
    setSnap(nearestSnap(snap));
  }

  // stop map panning when user scrolls inside sheet
  // (important for iOS: prevent the map from stealing scroll)
  function stopMapGesture(e) {
    e.stopPropagation();
  }

  if (!active) return null;

  return (
    <div className="vl-sheet-layer" onClick={close}>
      <div
        className="vl-sheet"
        ref={sheetRef}
        style={{ transform: translateY }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="vl-sheet-handle"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
        >
          <div className="vl-sheet-grabber" />
          <button className="vl-sheet-close" onClick={close} aria-label="close">×</button>
        </div>

        <div className="vl-sheet-content" onTouchStart={stopMapGesture} onTouchMove={stopMapGesture}>
          {/* (reuse your existing InfoWindow content here) */}
          <div className="vl-sheet-hero">
            <img
              className="vl-sheet-hero-img"
              src="https://placehold.co/640x240/f9f9f9/999999/png?text=Parking"
              alt=""
              loading="lazy"
            />
          </div>

          <div className="vl-sheet-body">
            <div className="vl-sheet-titleRow">
              <div className="vl-sheet-title">{active.name}</div>
              <div className="vl-sheet-vac">
                空位：<span className="vl-sheet-vacNum">{active.vacancy ?? "未知"}</span>
              </div>
            </div>

            <div className="vl-sheet-addr">{active.addressZh}</div>

            {(() => {
              const m = minutesAgo(active.lastUpdated);
              if (m == null) return null;
              if (m <= 3) return null;
              return <div className="vl-sheet-warn">資料可能延遲（{m} 分鐘）</div>;
            })()}

            <div className="vl-sheet-meta">
              <div>最近更新：{formatTime(active.lastUpdated)}</div>
              {(() => {
                const ms = minSecAgo(active.lastUpdated);
                if (!ms) return null;
                return <div>（{ms.min} 分 {String(ms.sec).padStart(2, "0")} 秒前）</div>;
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


