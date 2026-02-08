// frontend/src/components/LotsSidebar.jsx
import LotsList from "./LotsList";

import LotSearchBar from "./LotSearchBar";

export default function LotsSidebar({ title, lots, active, onSelect, onPick, onClear }) {
  return (
    <div className="side">
      <div className="side-title">{title || `所有停車場 (${lots.length})`}</div>
      <LotSearchBar onPick={onPick} onClear={onClear} />
      <LotsList lots={lots} active={active} onSelect={onSelect} />
    </div>
  );
}
