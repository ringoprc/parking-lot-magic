// frontend/src/components/LotsList.jsx
import { minutesAgo } from "../utils/time";

export default function LotsList({ lots, active, onSelect }) {
  return (
    <>
      <div className="lot-btn-list">
        {lots.map((l) => (
          <button
            key={l.lotId}
            className={`lot-btn ${active?.lotId === l.lotId ? "active" : ""}`}
            onClick={() => onSelect?.(l)}
            type="button"
          >
            <div className="lot-btn-name-div">
              <div className="lot-btn-name">{l.name}</div>
              <span className="lot-btn-sub-vacancy-count">
                [空位：{l.vacancy ?? "未知"}]
              </span>
            </div>
            <div className="lot-btn-sub">
              <span className="lot-btn-sub-address">
                {l.addressZh}
              </span>
              <span className="lot-btn-sub-time-ago">
                {minutesAgo(l.lastUpdated) != null
                  ? `更新於 ${minutesAgo(l.lastUpdated)} 分鐘前`
                  : "—"}
              </span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}