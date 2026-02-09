// frontend/src/components/MobileLotsOverlay.jsx
import LotsList from "./LotsList";

import LotSearchBar from "./LotSearchBar";

export default function MobileLotsOverlay({
  open,
  setOpen,
  lots,
  active,
  onSelect,
  onPick,
  onClear,
  sheetFetchedText,
  locatingMe,
  requestMyLocation,
  myPos
}) {
  return (
    <div className={`mobile-lots-overlay ${open ? "open" : ""}`}>
      <div className="mobile-lots-overlay-scroll">
        <div className="mobile-lots-overlay-list">
          <LotSearchBar
            onPick={onPick}
            onClear={onClear}
            setOpen={setOpen}
            locatingMe={locatingMe}
            requestMyLocation={requestMyLocation}
            myPos={myPos}
          />
          <div
            className="lot-btn-list-outer"
          >
            <LotsList
              lots={lots}
              active={active}
              onSelect={(l) => onSelect?.(l)}
            />
          </div>
        </div>
      </div>
      {sheetFetchedText && (
        <div className="title-bar-devmeta">{sheetFetchedText}</div>
      )}
    </div>
  );
}