import { useEffect, useRef, useState } from "react";
import AiResultHistory from "./AiResultHistory";
// frontend/src/components/LotsList.jsx
import { minutesAgo } from "../utils/time";
import {
  getAvailabilityDisplayValue,
  getAvailabilityTextColor,
} from "../utils/availability";

function LotCard({ l, active, onSelect, showDistance, formatDist, focus, apiBase }) {
  const cardRef = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);
  return (
            <button
              ref={cardRef}
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
                      marginBottom: "0px",
                      marginRight: "3px",
                      fontWeight: "700",
                      fontSize: "11.5px"
                    }}
                  >
                  空位：
                  <b>
                    {getAvailabilityDisplayValue(l)}
                  </b>
                  </span>

                </span>
              </div>
              <AiResultHistory apiBase={apiBase} lotId={l.lotId} hideWhenEmpty enabled={visible} />
              <div className="lot-btn-sub">
                                  {showDistance && l._dist != null && (
                    <span className="lot-btn-distance">
                      <span className="lot-dist">{`距離 ${focus?.name || "目的地"} `}</span>
                      <span style={{ marginLeft: "6px", fontSize: "13.5px", color: "#333", fontWeight: "900"}}>
                        {formatDist(l._dist)}
                      </span>
                    </span>
                  )}

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
  );
}

export default function LotsList({ lots, ...props }) {
  return <div className="lot-btn-list"><div className="lot-btn-list-inner">
    {lots.map((lot) => <LotCard key={lot.lotId} l={lot} {...props} />)}
  </div></div>;
}
