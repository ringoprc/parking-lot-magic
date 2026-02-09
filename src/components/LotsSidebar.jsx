// frontend/src/components/LotsSidebar.jsx
import LotsList from "./LotsList";

import LotSearchBar from "./LotSearchBar";

export default function LotsSidebar({
  title,
  lots,
  active,
  onSelect,
  onPick,
  onClear,
  setOpen,
  locatingMe,
  requestMyLocation,
  myPos
}) {
  return (
    <div className="side">
      <div className="side-title">{title || `所有停車場 (${lots.length})`}</div>
      <LotSearchBar
        onPick={onPick}
        onClear={onClear}
        setOpen={setOpen}
        locatingMe={locatingMe}
        requestMyLocation={requestMyLocation}
        myPos={myPos}
      />
      <LotsList lots={lots} active={active} onSelect={onSelect} />
    </div>
  );
}
