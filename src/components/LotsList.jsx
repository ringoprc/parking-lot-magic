// frontend/src/components/LotsList.jsx
import { minutesAgo } from "../utils/time";
function toVacancyNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getVacancyTextColor(v) {
  const n = toVacancyNum(v);
  if (n == null) return "#b6b6b6";   // unknown -> gray (pin border)
  if (n === 0) return "#C5221F";     // 0 -> red (pin border)
  if (n <= 5) return "#C58F00";      // low -> yellow (pin border)
  return "#0F7B2E";                  // ok -> green (pin border)
}

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
              <span className="lot-btn-sub-vacancy-count" 
                style={{ color: getVacancyTextColor(l.vacancy) }}
              >
                [空位：
                <b>
                  {l.vacancy ?? "未知"}
                </b>
                ]
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