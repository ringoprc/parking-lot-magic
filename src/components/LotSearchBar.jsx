// frontend/src/components/LotSearchBar.jsx
import { useState, useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import toast from "react-hot-toast";

import { FiSearch, FiX } from "react-icons/fi";

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
  apiBase = "",
  placeholder = "搜尋停車場/地點/地址…",
  resultCount,
  mobileExpanded,
  onSearchFocus,
  onCloseSearch,
  onPick, // (place) => void
  onClear, // () => void
  setOpen,
  requestMyLocation,  // () => void
  locatingMe,         // boolean
  myPos,
}) {

  const places = useMapsLibrary("places");

  const [q, setQ] = useState("");
  const [googleItems, setGoogleItems] = useState([]);
  const [localItems, setLocalItems] = useState([]);
  const [localSearchStatus, setLocalSearchStatus] = useState("idle");
  const items = [...localItems, ...googleItems];
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [searchFocused, setSearchFocused] = useState(false);

  //const [locating, setLocating] = useState(false);
  //const locateTimeoutRef = useRef(null);

  const rootRef = useRef(null);
  const tokenRef = useRef(null);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const skipNextFetchRef = useRef(false);
  const searchRequestRef = useRef(0);
  const composingRef = useRef(false);
  const pendingPickRef = useRef(null);
  const ddRef = useRef(null);
  const itemRefs = useRef([]); // includes [0]=myLocation, [1..]=suggestions

  const touchArmedRef = useRef(false);
  const touchStartXYRef = useRef({ x: 0, y: 0 });
  const TOUCH_TAP_SLOP_PX = 10; // tap tolerance

  const prevLocatingRef = useRef(false);

  useEffect(() => {
    const was = prevLocatingRef.current;
    const now = !!locatingMe;
    prevLocatingRef.current = now;

    // Only act on transition: true -> false
    if (!was || now) return;

    // We only auto-fix the text if we were showing "定位中…"
    if (q !== "定位中…") return;

    if (myPos?.lat != null && myPos?.lng != null) {
      // ✅ success
      skipNextFetchRef.current = true;
      setQ("我現在的位置");
      setSuggestionOpen(false);
      setActiveIdx(-1);
      tokenRef.current = null;
      inputRef.current?.blur?.();
    } else {
      // ❌ failed / denied
      skipNextFetchRef.current = true;
      setQ("");
      setSuggestionOpen(true);
      setActiveIdx(0);
    }
  }, [locatingMe, myPos, q]);

  /*
  const { locating, requestMyLocation } = useMyLocationAction({
    onStart: () => {
      // Exactly your current “start” UI
      skipNextFetchRef.current = true;
      setQ("定位中…");
      setSuggestionOpen(true);
      setActiveIdx(0);

      document.activeElement?.blur?.();
    },

    onSuccess: ({ lat, lng, accuracy }) => {
      // publish to parent for blue dot
      onMyLocation?.({ lat, lng, accuracy });

      // reuse existing contract with parent (keeps current behavior)
      onPick?.({
        name: "我的位置",
        address: "",
        lat,
        lng,
        viewport: null,
        kind: "my_location",
      });

      skipNextFetchRef.current = true;
      setQ("我現在的位置");
      setSuggestionOpen(false);
      setActiveIdx(-1);

      tokenRef.current = null;
      inputRef.current?.blur?.();
    },

    onError: () => {
      // Exactly your current “reset UI” on error
      skipNextFetchRef.current = true;
      setQ("");
      setSuggestionOpen(true);
      setActiveIdx(0);
    },

    onTimeout: () => {
      // Exactly your current “reset UI” on hard timeout
      skipNextFetchRef.current = true;
      setQ("");
      setSuggestionOpen(true);
      setActiveIdx(0);
    },
  });
  */

  useEffect(() => {
    const requestId = ++searchRequestRef.current;
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted && searchRequestRef.current === requestId;
    const query = q.trim();
    setLocalItems([]);
    setGoogleItems([]);
    setLocalSearchStatus("idle");

    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      setSuggestionOpen(false);
      setActiveIdx(-1);
      return;
    }
    if (!query) {
      tokenRef.current = null;
      return;
    }

    setSuggestionOpen(true);
    setActiveIdx(-1);
    setLocalSearchStatus("loading");
    debounceRef.current = setTimeout(() => {
      // Independent requests: local lots remain available if Google fails or
      // its library has not loaded. Ignore responses for an older query.
      fetch(`${apiBase}/api/lots/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("停車場搜尋失敗");
          const data = await res.json();
          if (!isCurrent()) return;
          setLocalItems((data.results || []).slice(0, 2).map((lot) => ({
            lot,
            placePrediction: {
              placeId: `local:${lot.lotId}`,
              structuredFormat: {
                mainText: lot.name,
                secondaryText: ["本站停車場", lot.address].filter(Boolean).join(" · "),
              },
            },
          })));
          setActiveIdx(-1);
          setLocalSearchStatus("ready");
        })
        .catch((error) => {
          if (isCurrent()) {
            console.error("[lots] search failed:", error);
            setLocalSearchStatus("error");
          }
        });

      if (!window.google?.maps || !places) return;
      (async () => {
        try {
          if (!tokenRef.current) tokenRef.current = new places.AutocompleteSessionToken();
          let list;
          if (places.AutocompleteSuggestion) {
            const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
              input: query,
              language: "zh-TW",
              region: "tw",
              sessionToken: tokenRef.current,
            });
            list = (suggestions || []).slice(0, 8);
          } else {
            const preds = await classicFetchPredictions(query, { language: "zh-TW" });
            list = preds.slice(0, 8).map((p) => ({
              placePrediction: {
                placeId: p.place_id,
                text: p.description,
                structuredFormat: {
                  mainText: p.structured_formatting?.main_text || "",
                  secondaryText: p.structured_formatting?.secondary_text || "",
                },
              },
            }));
          }
          if (isCurrent()) setGoogleItems(list);
        } catch (error) {
          if (isCurrent()) console.error("[places] autocomplete failed:", error);
        }
      })();
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(debounceRef.current);
    };
  }, [q, places, apiBase]);

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
      setSuggestionOpen(false);
    }

    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);

    return () => {
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  function pickMyLocation() {
    /*
    if (locating) return; // prevent double tap

    if (!navigator.geolocation) {
      alert("此裝置/瀏覽器不支援定位功能");
      return;
    }

    setLocating(true);

    // Give immediate feedback in the input
    skipNextFetchRef.current = true;
    setQ("定位中…");
    setSuggestionOpen(true);
    setActiveIdx(0);

    document.activeElement?.blur?.();

    // Hard timeout: if GPS is off / cannot acquire
    if (locateTimeoutRef.current) clearTimeout(locateTimeoutRef.current);
    locateTimeoutRef.current = setTimeout(() => {
      setLocating(false);
      setQ("");                 // back to empty so user sees dropdown again
      setSuggestionOpen(true);  // show "my location" again
      setActiveIdx(0);
      alert("定位逾時。請開啟手機定位/GPS，或確認瀏覽器允許定位權限。");
    }, 12000);

    setTimeout(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (locateTimeoutRef.current) clearTimeout(locateTimeoutRef.current);
          setLocating(false);

          const { latitude, longitude } = pos.coords;

          // reuse existing contract with parent
          onPick?.({
            name: "我的位置",
            address: "",
            lat: latitude,
            lng: longitude,
            viewport: null,
            kind: "my_location",
          });

          // prevent triggering autocomplete fetch due to setQ
          skipNextFetchRef.current = true;
          setQ("我現在的位置");
          setSuggestionOpen(false);
          setActiveIdx(-1);

          tokenRef.current = null;
          inputRef.current?.blur?.();
        },
        (err) => {
          if (locateTimeoutRef.current) clearTimeout(locateTimeoutRef.current);
          setLocating(false);

          // reset UI so user can try again
          skipNextFetchRef.current = true;
          setQ("");
          setSuggestionOpen(true);
          setActiveIdx(0);

          // better message based on error type
          const code = err?.code;
          if (code === 1) {
            alert("定位權限被拒絕。請到瀏覽器設定中允許定位。");
          } else if (code === 2) {
            alert("無法取得位置。可能是 GPS 關閉或訊號不佳，請開啟定位後再試一次。");
          } else if (code === 3) {
            alert("定位逾時。請確認 GPS 開啟並稍後再試。");
          } else {
            alert("無法取得定位，請確認已允許定位權限並開啟 GPS。");
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        }
      );
    }, 250);
    */
    if (locatingMe) return;
    searchRequestRef.current += 1;

    // UI: exactly what you already do on start
    skipNextFetchRef.current = true;
    setQ("定位中…");
    setSuggestionOpen(true);
    setActiveIdx(0);
    document.activeElement?.blur?.();

    // Call shared action
    requestMyLocation?.();
  }

  useEffect(()=>{
    if(!locatingMe){
      setOpen(false);
    }
  },[locatingMe])

  /*
  useEffect(() => {
    return () => {
      if (locateTimeoutRef.current) clearTimeout(locateTimeoutRef.current);
    };
  }, []);
  */

  function scrollKeyboardSelectionIntoView(index) {
    const container = ddRef.current;
    const el = itemRefs.current[index];
    if (!container || !el) return;

    // Only keyboard navigation scrolls; hovering merely highlights the item.
    const cTop = container.scrollTop;
    const cBottom = cTop + container.clientHeight;

    const eTop = el.offsetTop;
    const eBottom = eTop + el.offsetHeight;

    // Add a little padding so it’s not flush to edges
    const pad = 8;

    if (eTop < cTop + pad) {
      container.scrollTop = Math.max(0, eTop - pad);
    } else if (eBottom > cBottom - pad) {
      container.scrollTop = eBottom - container.clientHeight + pad;
    }
  }

  async function pickSuggestion(s) {
    if (!s?.placePrediction) return;
    /*if (composingRef.current) return;*/

    const pickRequestId = ++searchRequestRef.current;
    try {
      const pp = s.placePrediction;

      if (s.lot) {
        const res = await fetch(`${apiBase}/api/lots/${encodeURIComponent(s.lot.lotId)}/details`);
        if (!res.ok) throw new Error("無法載入停車場資訊，請稍後再試");
        const data = await res.json();
        if (searchRequestRef.current !== pickRequestId) return;
        onPick?.({ ...data.lot, kind: "lot" });
      } else if (pp?.toPlace) {
        const place = pp.toPlace();
        await place.fetchFields({ fields: ["displayName", "formattedAddress", "location", "viewport"] });
        const loc = place.location;
        if (!loc) return;

        console.log('HERE1');

        console.log('place:', place);
        console.log('place.displayName:', place.displayName);
        console.log('place.formattedAddress:', place.formattedAddress);
        console.log('loc.lat():', loc.lat());
        console.log('loc.lng():', loc.lng());
        console.log('place.viewport:', place.viewport);

        onPick?.({
          name: place.displayName ?? "",
          address: place.formattedAddress ?? "",
          lat: loc.lat(),
          lng: loc.lng(),
          viewport: place.viewport ?? null,
        });
      } else {
        // classic fallback：用 PlacesService.getDetails
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
      setSuggestionOpen(false);
      setActiveIdx(-1);
      setOpen(false);

      // reset session token after a selection
      tokenRef.current = null;
      inputRef.current?.blur?.();

    } catch (e) {
      console.log('[pickSuggestion] Error applying suggestion:', e);
      if (s.lot && searchRequestRef.current === pickRequestId) {
        toast.error("無法載入停車場資訊，請稍後再試");
      }
    }
  }


  function requestPickMyLocation() {
    if (locatingMe) return;

    if (composingRef.current) {
      pendingPickRef.current = { type: "myLocation" };
      inputRef.current?.blur?.();
      return;
    }
    pickMyLocation(); // 會統一走同一個 UI + props requestMyLocation()
  }

  function requestPickSuggestion(s) {
    if (!s?.placePrediction) return;

    if (composingRef.current) {
      pendingPickRef.current = { type: "suggestion", s };
      inputRef.current?.blur?.();
      return;
    }
    pickSuggestion(s);
  }

  return (
    <div
      ref={rootRef}
      className={`lot-search ${searchFocused ? "is-focused" : ""} ${mobileExpanded ? "is-expanded" : ""}`}
    >
      <div className="lot-search-input-wrap">
        <input
          ref={inputRef}
          className={`lot-search-input ${((suggestionOpen && q !== "我現在的位置" && !!q) || suggestionOpen) ? "has-items" : ""}`}
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            searchRequestRef.current += 1;
            skipNextFetchRef.current = false;
            setQ(e.target.value);
            setSuggestionOpen(true);
          }}
          onFocus={() => {
            onSearchFocus?.();
            if (items.length > 0 && q.trim()) setSuggestionOpen(true);
            if (!q.trim()) {
              setSuggestionOpen(true);   // empty → show "my location"
              setActiveIdx(0);
            } else if (items.length > 0) {
              setSuggestionOpen(true);
            }
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;

            // 重要：iOS 有時 compositionend 才是最終字串
            // 這行可保險（不一定每次需要，但不會害你）
            setQ(e.target.value);

            // 如果使用者剛剛是在 composing 狀態下點了 dropdown item
            const pending = pendingPickRef.current;
            if (pending) {
              pendingPickRef.current = null;

              // 讓 input 的 composing 真正收尾（有些 iOS 需要）
              inputRef.current?.blur?.();

              // 用 microtask 確保 blur / composition 完成後再 pick
              Promise.resolve().then(() => {
                if (pending.type === "myLocation") requestMyLocation();
                else if (pending.type === "suggestion") pickSuggestion(pending.s);
              });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && mobileExpanded && !composingRef.current) {
              setSuggestionOpen(false);
              inputRef.current?.blur?.();
              onCloseSearch?.();
              return;
            }
            if (!suggestionOpen) return;
            const ddLen = (items?.length || 0) + 1; // +1 for "my location"

            // IME composing: let Enter finish composition, don't pick suggestion
            const isComposing = e.isComposing || composingRef.current || e.keyCode === 229;
            if (isComposing) {
              // Optional: still allow Escape to close dropdown even during composition
              if (e.key === "Escape") setSuggestionOpen(false);
              return;
            }

            if (e.key === "ArrowDown") {
              e.preventDefault();
              const nextIndex = Math.min(activeIdx + 1, ddLen - 1);
              setActiveIdx(nextIndex);
              scrollKeyboardSelectionIntoView(nextIndex);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              const nextIndex = Math.max(activeIdx - 1, 0);
              setActiveIdx(nextIndex);
              scrollKeyboardSelectionIntoView(nextIndex);
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (activeIdx === 0) {
                pickMyLocation();
                return;
              }
              const chosen = items[activeIdx - 1] || items[0];
              if (chosen) pickSuggestion(chosen);
            } else if (e.key === "Escape") {
              setSuggestionOpen(false);
            }
          }}
        />

        {(q.trim() === "" || resultCount != null) && (
          <FiSearch className="lot-search-icon" size={20} aria-hidden="true" />
        )}

        {resultCount != null && !q.trim() && !searchFocused && !mobileExpanded && (
          <span className="desktop-search-count" title="隨地圖移動或縮放更新" aria-label={`目前地圖範圍內 ${resultCount} 個停車場`}>
            <span className="search-count-scope">地圖範圍內</span>
            <span>{resultCount} 個車場</span>
          </span>
        )}

        {/* Clear (X) */}
        {(q.trim() !== "" || mobileExpanded) && (
          <button
            type="button"
            className="lot-search-clear"
            aria-label={mobileExpanded ? "關閉搜尋" : "清除搜尋"}
            onMouseDown={(e) => {
              // 避免 mousedown 先讓 input blur，導致 focusout 邏輯介入
              e.preventDefault();
            }}
            onClick={() => {
              setQ("");
              setSuggestionOpen(false);
              setActiveIdx(-1);

              // 你現在的策略：q 清空後 items 會被 effect 清掉
              // 這邊可以不手動 setItems([])，交給 effect
              tokenRef.current = null;
              searchRequestRef.current += 1;
              skipNextFetchRef.current = false;

              // 讓使用者可以立刻再輸入
              if (mobileExpanded) {
                inputRef.current?.blur?.();
                onCloseSearch?.();
              } else inputRef.current?.focus?.();
              onClear?.();
            }}
          >
            <FiX size={16} />
          </button>
        )}
      </div>

      <div className="lot-search-horizontal-div"></div>

      {suggestionOpen && (
        <div ref={ddRef} className="lot-search-dd">
          <button
            type="button"
            ref={(el) => (itemRefs.current[0] = el)}
            className={`lot-search-dd-item is-my-location ${activeIdx === 0 ? "active" : ""}`}
            style={{
              background: "#fff3d7"
            }}
            onMouseEnter={() => setActiveIdx(0)}
            onMouseDown={(e) => {
              e.preventDefault();
              requestPickMyLocation();
            }}
            onTouchStart={(e) => {
              // prevent iOS from triggering blur / focusout / click synthesis
              e.preventDefault();
              touchArmedRef.current = true;

              const t = e.touches?.[0];
              if (t) touchStartXYRef.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchMove={(e) => {
              // if user is scrolling, disarm
              const t = e.touches?.[0];
              if (!t) return;
              const dx = Math.abs(t.clientX - touchStartXYRef.current.x);
              const dy = Math.abs(t.clientY - touchStartXYRef.current.y);
              if (dx > TOUCH_TAP_SLOP_PX || dy > TOUCH_TAP_SLOP_PX) {
                touchArmedRef.current = false;
              }
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              if (!touchArmedRef.current) return;
              touchArmedRef.current = false;

              requestPickMyLocation();
            }}
            disabled={locatingMe}
          >
            <div className="lot-search-dd-lines">
              <div className="lot-search-dd-title">
                📍 {locatingMe ? "定位中…" : "使用我現在的位置"}
              </div>
              <div className="lot-search-dd-sub">
                {locatingMe ? "請稍候，正在取得定位…" : "允許定位後顯示附近停車場"}
              </div>
            </div>
          </button>
          {localSearchStatus === "loading" && (
            <div className="lot-search-status" role="status">正在搜尋本站停車場…</div>
          )}
          {localSearchStatus === "error" && (
            <div className="lot-search-status" role="status">本站停車場暫時無法載入，請稍後再試。</div>
          )}
          {items.map((s, idx) => {
            const realIdx = idx + 1;
            return (
              <button
                key={`${s.placePrediction.placeId}-${idx}`}
                type="button"
                ref={(el) => (itemRefs.current[realIdx] = el)}
                className={`lot-search-dd-item ${s.lot ? "is-local-lot" : ""} ${realIdx === activeIdx ? "active" : ""}`}
                onMouseEnter={() => setActiveIdx(realIdx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  requestPickSuggestion(s);
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  touchArmedRef.current = true;

                  const t = e.touches?.[0];
                  if (t) touchStartXYRef.current = { x: t.clientX, y: t.clientY };
                }}
                onTouchMove={(e) => {
                  const t = e.touches?.[0];
                  if (!t) return;
                  const dx = Math.abs(t.clientX - touchStartXYRef.current.x);
                  const dy = Math.abs(t.clientY - touchStartXYRef.current.y);
                  if (dx > TOUCH_TAP_SLOP_PX || dy > TOUCH_TAP_SLOP_PX) {
                    touchArmedRef.current = false;
                  }
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  if (!touchArmedRef.current) return;
                  touchArmedRef.current = false;

                  requestPickSuggestion(s);
                }}
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
            )
          })}
        </div>
      )}
    </div>
  );
}
