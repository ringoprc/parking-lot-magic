// frontend/src/components/MobileLotsBar.jsx
import { FiSearch, FiX } from "react-icons/fi";

export default function MobileLotsBar({ title, count, open, onToggle }) {
  return (
    <button type="button" className="mobile-lots-bar" onClick={onToggle}
      aria-expanded={open} aria-label={`${open ? "關閉" : "展開"}停車場搜尋，${title || `${count} 個停車場`}`}>
      <span className="mobile-search-leading"><FiSearch size={19} /></span>
      <span className="mobile-lots-label">搜尋停車場或目的地</span>
      <span className="mobile-lots-count">{count} 個車場</span>
      {open && <span className="mobile-lots-toggle"><FiX size={18} /></span>}
    </button>
  );
}
