// frontend/src/components/MobileLotsOverlay.jsx
import LotsList from "./LotsList";

import LotSearchBar from "./LotSearchBar";

export default function MobileLotsOverlay({ open, lots, active, onSelect, onPick }) {
  return (
    <div className={`mobile-lots-overlay ${open ? "open" : ""}`}>
      <div className="mobile-lots-overlay-scroll">
        <div className="mobile-lots-overlay-list">
          <LotSearchBar onPick={onPick} />
          <LotsList
            lots={lots}
            active={active}
            onSelect={(l) => onSelect?.(l)}
          />
        </div>
      </div>
    </div>
  );
}