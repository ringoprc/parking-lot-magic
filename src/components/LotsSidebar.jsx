// frontend/src/components/LotsSidebar.jsx
import LotsList from "./LotsList";

import LotSearchBar from "./LotSearchBar";

export default function LotsSidebar({
  apiBase,
  title,
  count,
  lots,
  active,
  onSelect,
  onPick,
  onClear,
  setOpen,
  locatingMe,
  requestMyLocation,
  myPos,
  showDistance,
  formatDist,
  focus
}) {
  return (
    <div className="side desktop-search-side">
      {focus?.name && <div className="side-title">{title}</div>}
      <LotSearchBar
        apiBase={apiBase}
        placeholder="搜尋停車場或目的地"
        resultCount={count ?? lots.length}
        onPick={onPick}
        onClear={onClear}
        setOpen={setOpen}
        locatingMe={locatingMe}
        requestMyLocation={requestMyLocation}
        myPos={myPos}
      />
      <LotsList 
        lots={lots} 
        active={active} 
        onSelect={onSelect} 
        showDistance={showDistance}
        formatDist={formatDist}
        focus={focus}
      />
    </div>
  );
}
