// frontend/src/components/LotsSidebar.jsx
import LotsList from "./LotsList";

import LotSearchBar from "./LotSearchBar";

export default function LotsSidebar({ lots, active, onSelect, onPick }) {
  return (
    <div className="side">
      <div className="side-title">所有停車場 ({lots.length})</div>
      <LotSearchBar onPick={onPick} />
      <LotsList lots={lots} active={active} onSelect={onSelect} />
    </div>
  );
}
