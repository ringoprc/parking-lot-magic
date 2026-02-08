// frontend/src/components/LotSearchBar.jsx
import { useState, useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";

function getSuggestionTitle(s) {
  const p = s?.placePrediction;
  const sf = p?.structuredFormat;

  const title =
    sf?.mainText?.toString?.() ||
    p?.mainText?.toString?.() ||
    p?.text?.toString?.() ||
    "";

  // 如果 text 是 "Name, Address" 這種格式，只取逗號前
  const first = title.split(",")[0].trim();
  return first || title;
}

function classicFetchPredictions(query, opts) {
  const g = window.google;
  const svc = new g.maps.places.AutocompleteService();

  return new Promise((resolve, reject) => {
    svc.getPlacePredictions(
      {
        input: query,
        language: opts?.language || "zh-TW",
        // componentRestrictions: { country: "tw" }, // 可選：更聚焦台灣
      },
      (preds, status) => {
        if (status !== g.maps.places.PlacesServiceStatus.OK || !preds) {
          return reject(new Error(`AutocompleteService: ${status}`));
        }
        resolve(preds);
      }
    );
  });
}



export default function LotSearchBar({
  placeholder = "搜尋地點/地址…",
  onPick, // (place) => void
}) {

  const places = useMapsLibrary("places");

  const [q, setQ] = useState("");
  const [items, setItems] = useState([]); // suggestions
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [searchFocused, setSearchFocused] = useState(false);

  const rootRef = useRef(null);
  const placesLibRef = useRef(null);
  const tokenRef = useRef(null);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const skipNextFetchRef = useRef(false);
  const lastFetchedQRef = useRef(""); // 記錄上次真的打 API 的 query


  useEffect(() => {

    const g = window.google;
    const lib = places; // 直接用 hook 回來的 library
    const hasNew = !!lib?.AutocompleteSuggestion;
    if (!g?.maps || !lib) return; // maps or places library not ready yet

    const query = q.trim();
    if (!query) {
      setItems([]);
      setOpen(false);
      setActiveIdx(-1);
      tokenRef.current = null;
      return;
    }

    // ✅ selection 造成的 setQ：不要打 API，也不要改 items
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      setOpen(false);
      setActiveIdx(-1);
      return;
    }

    // ✅ 如果 q 沒變（例如 focus/blur 來回），不要重打 API
    if (query === lastFetchedQRef.current) {
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        if (!tokenRef.current) {
          tokenRef.current = new lib.AutocompleteSessionToken();
        }

        const req = {
          input: query,

          // ✅ ensure Traditional Chinese results where possible
          language: "zh-TW",
          region: "tw",

          // Optional: bias to Taipei to improve ranking
          // locationBias: { lat: 25.033, lng: 121.565, radius: 50000 },

          sessionToken: tokenRef.current,
        };

        let list = [];

        if (hasNew) {
          const req = {
            input: query,
            language: "zh-TW",
            region: "tw",
            sessionToken: tokenRef.current,
          };

          const { suggestions } =
            await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);

          list = (suggestions || []).slice(0, 8);
        } else {
          // fallback: classic AutocompleteService
          const preds = await classicFetchPredictions(query, { language: "zh-TW" });
          list = preds.slice(0, 8).map((p) => ({
            // 讓你下面 render/pickSuggestion 可以沿用類似結構
            placePrediction: {
              placeId: p.place_id,
              text: { toString: () => p.description },
              structuredFormat: {
                mainText: { toString: () => p.structured_formatting?.main_text || "" },
                secondaryText: { toString: () => p.structured_formatting?.secondary_text || "" },
              },
              // ⚠️ classic 沒有 toPlace()，pickSuggestion 也要做 fallback（下一段）
              _classic: p,
            },
          }));
        }

        lastFetchedQRef.current = query;
        setItems(list);
        setOpen(list.length > 0);
        setActiveIdx(list.length ? 0 : -1);

      } catch (e) {
        console.error("[places] fetchAutocompleteSuggestions failed:", e);
        setItems([]);
        setOpen(false);
        setActiveIdx(-1);
      }
    }, 180);

    return () => clearTimeout(debounceRef.current);
  }, [q]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function onFocusIn() {
      setSearchFocused(true);
    }
    function onFocusOut(e) {
      const next = e.relatedTarget;
      if (next && root.contains(next)) return;
      setSearchFocused(false);
      setOpen(false);
    }

    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);

    return () => {
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  async function pickSuggestion(s) {
    if (!s?.placePrediction) return;

    try {
      const pp = s.placePrediction;

      // ✅ 新 API
      if (pp?.toPlace) {
        const place = pp.toPlace();
        await place.fetchFields({ fields: ["displayName", "formattedAddress", "location", "viewport"] });
        const loc = place.location;
        if (!loc) return;

        console.log('place:', place);

        onPick?.({
          name: place.Gi.displayName,
          address: place.Gi.formattedAddress,
          lat: loc.lat(),
          lng: loc.lng(),
          viewport: place.viewport,
        });
      } else {
        // ✅ classic fallback：用 PlacesService.getDetails
        const g = window.google;
        const mapDiv = document.createElement("div"); // 不需要真的掛到 DOM
        const svc = new g.maps.places.PlacesService(mapDiv);

        const placeId = pp?.placeId;
        if (!placeId) return;

        const detail = await new Promise((resolve, reject) => {
          svc.getDetails(
            {
              placeId,
              fields: ["name", "formatted_address", "geometry"],
              language: "zh-TW",
            },
            (res, status) => {
              if (status !== g.maps.places.PlacesServiceStatus.OK || !res) {
                return reject(new Error(`getDetails: ${status}`));
              }
              resolve(res);
            }
          );
        });

        const loc = detail.geometry?.location;
        if (!loc) return;

        onPick?.({
          name: detail.name,
          address: detail.formatted_address,
          lat: loc.lat(),
          lng: loc.lng(),
          viewport: detail.geometry?.viewport,
        });
      }

      skipNextFetchRef.current = true;

      setQ(getSuggestionTitle(s));
      setOpen(false);
      setActiveIdx(-1);

      // reset session token after a selection
      tokenRef.current = null;
      inputRef.current?.blur?.();

    } catch (e) {

    }
  }

  return (
    <div
      ref={rootRef}
      className={`lot-search ${searchFocused ? "is-focused" : ""}`}
    >
      <input
        ref={inputRef}
        className={`lot-search-input ${items.length > 0 ? "has-items" : ""}`}
        value={q}
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => {
          if (items.length > 0 && q.trim()) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open) return;

          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, items.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const chosen = items[activeIdx] || items[0];
            if (chosen) pickSuggestion(chosen);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {open && items.length > 0 && (
        <div className="lot-search-dd">
          {items.map((s, idx) => (
            <button
              key={s.placePrediction.placeId}
              type="button"
              className={`lot-search-dd-item ${idx === activeIdx ? "active" : ""}`}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => pickSuggestion(s)}
            >
              {(() => {
                const p = s.placePrediction;

                // 1) Prefer structured format (main + secondary)
                const sf = p?.structuredFormat;

                const name =
                  sf?.mainText?.toString?.() ||
                  // fallback: sometimes displayNameText exists in some versions
                  p?.mainText?.toString?.() ||
                  "";

                const addr =
                  sf?.secondaryText?.toString?.() ||
                  p?.secondaryText?.toString?.() ||
                  "";

                // 2) Last resort: try to split "text" into 2 parts
                if (!name && !addr) {
                  const t = p?.text?.toString?.() || "";
                  // common format: "Name, Address"
                  const parts = t.split(",").map((x) => x.trim()).filter(Boolean);
                  const n = parts[0] || t;
                  const a = parts.slice(1).join(", ");
                  return (
                    <div className="lot-search-dd-lines">
                      <div className="lot-search-dd-title">{n}</div>
                      {a ? <div className="lot-search-dd-sub">{a}</div> : null}
                    </div>
                  );
                }

                return (
                  <div className="lot-search-dd-lines">
                    <div className="lot-search-dd-title">{name}</div>
                    {addr ? <div className="lot-search-dd-sub">{addr}</div> : null}
                  </div>
                );
              })()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


