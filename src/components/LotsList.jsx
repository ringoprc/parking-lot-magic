// frontend/src/components/LotsList.jsx
import { minutesAgo } from "../utils/time";
import {
  getAvailabilityDisplayValue,
  getAvailabilityTextColor,
} from "../utils/availability";

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
                  style={{ color: getAvailabilityTextColor(l) }}
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
                    {getAvailabilityDisplayValue(l)}
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


