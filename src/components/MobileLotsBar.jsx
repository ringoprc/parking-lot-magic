// frontend/src/components/MobileLotsBar.jsx
import { FiMenu, FiX } from "react-icons/fi";

export default function MobileLotsBar({ title, count, open, onToggle }) {
  return (
    <div 
    	className="mobile-lots-bar"
    	onClick={onToggle}
    >
      <div className="mobile-lots-label">
      	{title || `點此搜尋所有停車場 (${count})`}
      </div>

      <button
        type="button"
        className="mobile-lots-toggle"
        aria-label={open ? "關閉停車場清單" : "展開停車場清單"}
      >
        {open ? <FiX size={22} /> : <FiMenu size={22} />}
      </button>
    </div>
  );
}
