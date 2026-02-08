// frontend/src/components/MobileLotsBar.jsx
import { FiMenu, FiX } from "react-icons/fi";

export default function MobileLotsBar({ count, open, onToggle }) {
  return (
    <div className="mobile-lots-bar">
      <div className="mobile-lots-label">所有停車場 ({count})</div>

      <button
        type="button"
        className="mobile-lots-toggle"
        aria-label={open ? "關閉停車場清單" : "展開停車場清單"}
        onClick={onToggle}
      >
        {open ? <FiX size={22} /> : <FiMenu size={22} />}
      </button>
    </div>
  );
}
