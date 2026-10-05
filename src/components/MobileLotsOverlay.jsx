// frontend/src/components/MobileLotsOverlay.jsx
import LotsList from "./LotsList";



export default function MobileLotsOverlay({
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
          <div
            className="lot-btn-list-outer"
          >
            <LotsList
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
