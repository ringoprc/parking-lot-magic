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

export default function LotsList({ lots, active, onSelect, showDistance, formatDist, focus }) {
  return (
    <>
      <div className="lot-btn-list">
        <div className="lot-btn-list-inner">
          {lots.map((l) => (
            <button
              key={l.lotId}
              className={`lot-btn ${active?.lotId === l.lotId ? "active" : ""}`}
              onClick={() => onSelect?.(l)}
              type="button"
            >
              <div className="lot-btn-name-div">
                <div className="lot-btn-name">
                  <span>{l.name}</span>
                </div>
                <span className="lot-btn-sub-vacancy-count" 
                  style={{ color: getVacancyTextColor(l.vacancy) }}
                >
                  <span
                    style={{
                      marginBottom: "1px",
                      marginRight: "3px",
                      fontWeight: "700"
                    }}
                  >
                  [空位：
                  <b>
                    {l.vacancy ?? "未知"}
                  </b>
                  ]
                  </span>
                  {showDistance && l._dist != null && (
                    <>
                      <span className="lot-dist">{`距離 ${focus.name} `}</span>
                      <span style={{ marginLeft: "6px", fontSize: "13.5px", color: "#333", fontWeight: "900"}}>
                        {formatDist(l._dist)}
                      </span>
                    </>
                  )}
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
      </div>
    </>
  );
}



