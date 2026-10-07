// frontend/src/components/MobileLotsOverlay.jsx
import LotsList from "./LotsList";



export default function MobileLotsOverlay({
  apiBase,
  open,
  lots,
  active,
  onSelect,
  showDistance,
  formatDist,
  focus
}) {
  return (
    <div className={`mobile-lots-overlay ${open ? "open" : ""}`}>
      <div className="mobile-lots-overlay-scroll">
        <div className="mobile-lots-overlay-list">
          <p className="mobile-lots-list-label">目前地圖範圍內的停車場</p>
          <div
            className="lot-btn-list-outer"
          >
            <LotsList apiBase={apiBase}
              lots={lots}
              active={active}
              onSelect={(l) => onSelect?.(l)}
              showDistance={showDistance}
              formatDist={formatDist}
              focus={focus}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
