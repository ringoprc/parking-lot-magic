// frontend/src/hooks/useMyLocationAction.jsx
import { useEffect, useRef, useState } from "react";

/**
 * Exactly matches your LotSearchBar pickMyLocation logic,
 * but without directly depending on any UI.
 *
 * You provide callbacks to update UI state.
 */
export function useMyLocationAction({
  // Called immediately when request starts (you used: setLocating(true), setQ("定位中…") etc)
  onStart,

  // Called on success with coords + raw GeolocationPosition
  onSuccess,

  // Called on error with err
  onError,

  // Called when hard timeout fires (12s)
  onTimeout,

  // geolocation options
  geoOptions,

  // timings
  hardTimeoutMs = 12000,
  preDelayMs = 250,
} = {}) {
  const [locating, setLocating] = useState(false);
  const locateTimeoutRef = useRef(null);
  const inFlightRef = useRef(false);

  async function requestMyLocation() {
    if (inFlightRef.current || locating) return;
    if (!navigator.geolocation) {
      alert("此裝置/瀏覽器不支援定位功能");
      return;
    }

    inFlightRef.current = true;
    setLocating(true);
    onStart?.();

    // Hard timeout: if GPS is off / cannot acquire
    if (locateTimeoutRef.current) clearTimeout(locateTimeoutRef.current);
    locateTimeoutRef.current = setTimeout(() => {
      inFlightRef.current = false;
      setLocating(false);
      onTimeout?.();
      alert("定位逾時。請開啟手機定位/GPS，或確認瀏覽器允許定位權限。");
    }, hardTimeoutMs);

    setTimeout(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (locateTimeoutRef.current) clearTimeout(locateTimeoutRef.current);
          inFlightRef.current = false;
          setLocating(false);

          const { latitude, longitude, accuracy } = pos.coords;

          onSuccess?.(
            { lat: latitude, lng: longitude, accuracy: accuracy ?? null },
            pos
          );
        },
        (err) => {
          if (locateTimeoutRef.current) clearTimeout(locateTimeoutRef.current);
          inFlightRef.current = false;
          setLocating(false);

          // Same messages as your current logic
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

          onError?.(err);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
          ...(geoOptions || {}),
        }
      );
    }, preDelayMs);
  }

  useEffect(() => {
    return () => {
      if (locateTimeoutRef.current) clearTimeout(locateTimeoutRef.current);
    };
  }, []);

  return { locating, requestMyLocation };
}


