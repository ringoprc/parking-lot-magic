// frontend/src/pages/AdminDeviceLocationModal.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Map,
  AdvancedMarker,
  useMap,
} from "@vis.gl/react-google-maps";

import { formatTimeYYYYMMDD_HHMMSS } from "../../utils/time";

function finiteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatCoordinate(v) {
  const n = finiteNumber(v);
  return n == null ? "—" : n.toFixed(6);
}

function formatAccuracy(v) {
  const n = finiteNumber(v);
  if (n == null) return "—";

  return `±${Math.round(n)} m`;
}

const MAX_MAP_LOCATION_POINTS = 30;

function sampleLocationRows(rows, maxPoints = MAX_MAP_LOCATION_POINTS) {
  const validRows = (rows || [])
    .map((row, index) => {
      const latitude = finiteNumber(row?.latitude);
      const longitude = finiteNumber(row?.longitude);

      if (latitude == null || longitude == null) {
        return null;
      }

      return {
        ...row,

        // Real chronological position in the complete history.
        sequenceNumber: index + 1,

        latitude,
        longitude,
      };
    })
    .filter(Boolean);

  const count = validRows.length;

  if (count <= maxPoints) {
    return validRows;
  }

  const sampled = [];

  for (let i = 0; i < maxPoints; i++) {
    // Spread the chosen indexes evenly over the whole history.
    //
    // Example:
    // 100 records / 30 displayed
    // => approximately 1, 4, 8, 11 ... 100
    const index = Math.round(
      (i * (count - 1)) /
      (maxPoints - 1)
    );

    const row = validRows[index];

    // Rounding should not normally duplicate indexes,
    // but guard against it anyway.
    if (
      !sampled.some(
        (item) =>
          item.sequenceNumber === row.sequenceNumber
      )
    ) {
      sampled.push(row);
    }
  }

  return sampled;
}

function LocationSequenceMarker({
  sequenceNumber,
  isLatest,
}) {
  return (
    <div
      className={[
        "admin-dev-location-sequence-marker",
        isLatest ? "is-latest" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {sequenceNumber}
    </div>
  );
}

function FitLocationHistory({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !points?.length) return;

    const g = window.google;

    if (!g?.maps?.LatLngBounds) return;

    if (points.length === 1) {
      map.panTo({
        lat: points[0].latitude,
        lng: points[0].longitude,
      });

      map.setZoom(18);
      return;
    }

    const bounds = new g.maps.LatLngBounds();

    for (const point of points) {
      bounds.extend({
        lat: point.latitude,
        lng: point.longitude,
      });
    }

    map.fitBounds(bounds, 55);

    // If all coordinates are very close together,
    // fitBounds can zoom in excessively.
    const listener = map.addListener(
      "idle",
      () => {
        const zoom = map.getZoom?.();

        if (
          Number.isFinite(zoom) &&
          zoom > 18
        ) {
          map.setZoom(18);
        }

        listener.remove();
      }
    );

    return () => {
      listener.remove?.();
    };
  }, [map, points]);

  return null;
}

export default function AdminDeviceLocationModal({
  isOpen,
  deviceId,
  apiBase,
  adminKey,
  onClose,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!isOpen || !deviceId || !adminKey) return;

    let cancelled = false;

    async function loadLocations() {
      setLoading(true);
      setError("");
      setData(null);

      try {
        const res = await fetch(
          `${apiBase}/api/admin/devices/${encodeURIComponent(
            deviceId
          )}/locations?limit=3000`,
          {
            headers: {
              "x-admin-key": adminKey,
            },
          }
        );

        const json = await res.json();

        if (!res.ok) {
          throw new Error(
            json?.error || "讀取裝置位置資料失敗"
          );
        }

        if (!cancelled) {
          setData(json);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e?.message || "讀取裝置位置資料失敗"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadLocations();

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    deviceId,
    apiBase,
    adminKey,
  ]);

  const chronologicalRows = useMemo(() => {
    return Array.isArray(data?.rows)
      ? data.rows
      : [];
  }, [data]);

  const historyRows = useMemo(() => {
    // List: newest -> oldest
    return [...chronologicalRows].reverse();
  }, [chronologicalRows]);

  const sampledMapPoints = useMemo(() => {
    return sampleLocationRows(
      chronologicalRows,
      MAX_MAP_LOCATION_POINTS
    );
  }, [chronologicalRows]);

  const latest = useMemo(() => {
    if (data?.latest) {
      return data.latest;
    }

    // Fallback in case latest is absent but history exists.
    return historyRows[0] ?? null;
  }, [data, historyRows]);

  const currentPosition = useMemo(() => {
    const lat = finiteNumber(latest?.latitude);
    const lng = finiteNumber(latest?.longitude);

    if (lat == null || lng == null) {
      return null;
    }

    return {
      lat,
      lng,
    };
  }, [latest]);

  if (!isOpen || !deviceId) {
    return null;
  }

  return (
    <div
      className="admin-dev-location-modal-backdrop"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="裝置位置紀錄"
        className="admin-dev-location-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="admin-dev-location-modal-header">
          <div>
            <div className="admin-dev-location-modal-title">
              裝置位置紀錄
            </div>

            <div className="admin-dev-location-modal-device">
              裝置 ID：{deviceId}
            </div>
          </div>

          <button
            type="button"
            className="admin-dev-location-modal-close"
            onClick={onClose}
            aria-label="關閉"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="admin-dev-location-modal-message">
            正在讀取位置資料...
          </div>
        ) : error ? (
          <div
            className="admin-dev-location-modal-message"
            style={{ color: "#c5221f" }}
          >
            {error}
          </div>
        ) : !latest ? (
          <div className="admin-dev-location-modal-message">
            此裝置目前沒有位置資料
          </div>
        ) : (
          <>
            {/* Latest location summary */}
            <div className="admin-dev-location-summary">
              <div className="admin-dev-location-summary-main">
                <div>
                  <span className="admin-dev-location-summary-label">
                    緯度
                  </span>

                  <strong>
                    {formatCoordinate(latest.latitude)}
                  </strong>
                </div>

                <div>
                  <span className="admin-dev-location-summary-label">
                    經度
                  </span>

                  <strong>
                    {formatCoordinate(latest.longitude)}
                  </strong>
                </div>

                <div>
                  <span className="admin-dev-location-summary-label">
                    精度
                  </span>

                  <strong>
                    {formatAccuracy(
                      latest.accuracyMeters
                    )}
                  </strong>
                </div>
              </div>

              <div className="admin-dev-location-summary-time">
                定位時間：
                {latest.measuredAt
                  ? formatTimeYYYYMMDD_HHMMSS(
                      new Date(latest.measuredAt)
                    )
                  : "—"}
              </div>

              <div className="admin-dev-location-summary-received">
                後端收到：
                {latest.receivedAt
                  ? formatTimeYYYYMMDD_HHMMSS(
                      new Date(latest.receivedAt)
                    )
                  : "—"}
              </div>

              <div className="admin-dev-location-map-note">
                地圖顯示最多 30 個等距抽樣位置；
                標記數字為完整位置紀錄中的順序。
              </div>
            </div>

            {/* Map */}
            {currentPosition ? (
              <div className="admin-dev-location-map">
                <Map
                  defaultCenter={currentPosition}
                  defaultZoom={18}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                  clickableIcons={false}
                  mapId={
                    import.meta.env.VITE_GOOGLE_MAP_ID
                  }
                  style={{
                    width: "100%",
                    height: "100%",
                  }}
                >
                  <FitLocationHistory
                    points={sampledMapPoints}
                  />

                  {sampledMapPoints.map((point) => {
                    const isLatest =
                      point.sequenceNumber ===
                      chronologicalRows.length;

                    return (
                      <AdvancedMarker
                        key={`${point.sequenceNumber}-${point.measuredAt ?? ""}`}
                        position={{
                          lat: point.latitude,
                          lng: point.longitude,
                        }}
                        zIndex={
                          isLatest
                            ? 10000
                            : 1000 + point.sequenceNumber
                        }
                        title={
                          `#${point.sequenceNumber}` +
                          (point.measuredAt
                            ? ` • ${formatTimeYYYYMMDD_HHMMSS(
                                new Date(point.measuredAt)
                              )}`
                            : "")
                        }
                      >
                        <LocationSequenceMarker
                          sequenceNumber={
                            point.sequenceNumber
                          }
                          isLatest={isLatest}
                        />
                      </AdvancedMarker>
                    );
                  })}
                </Map>
              </div>
            ) : null}

            {/* History */}
            <div className="admin-dev-location-history-header">
              <span>位置紀錄</span>

              <span>
                {historyRows.length} 筆
              </span>
            </div>

            <div className="admin-dev-location-history">
              {historyRows.map((row, index) => (
                <div
                  className="admin-dev-location-history-row"
                  key={`${row.measuredAt ?? "unknown"}-${index}`}
                >
                  <div className="admin-dev-location-history-index">
                    {historyRows.length - index}
                  </div>

                  <div className="admin-dev-location-history-coordinates">
                    <div>
                      {formatCoordinate(row.latitude)},{" "}
                      {formatCoordinate(row.longitude)}
                    </div>

                    <div className="admin-dev-location-history-time">
                      {row.measuredAt
                        ? formatTimeYYYYMMDD_HHMMSS(
                            new Date(row.measuredAt)
                          )
                        : "—"}
                    </div>
                  </div>

                  <div className="admin-dev-location-history-accuracy">
                    {formatAccuracy(
                      row.accuracyMeters
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

