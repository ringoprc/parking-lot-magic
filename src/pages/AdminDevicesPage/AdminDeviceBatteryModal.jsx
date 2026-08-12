// frontend/src/pages/AdminDeviceBatteryModal.jsx
import {
  PiBatteryVerticalFull,
  PiBatteryVerticalHigh,
  PiBatteryVerticalMedium,
  PiBatteryVerticalLow,
} from "react-icons/pi";

import {
  formatTimeYYYYMMDD_HHMMSS,
  minSecAgo,
} from "../../utils/time";
import { getEffectiveChargingStatus } from "../../utils/deviceBattery";

function batteryLevel(pct) {
  if (pct == null) return null;

  const p = Number(pct);
  if (!Number.isFinite(p)) return null;

  return Math.max(0, Math.min(100, Math.round(p)));
}

function batteryColor(pct) {
  const p = batteryLevel(pct);

  if (p == null) return "#bbb";
  if (p >= 75) return "#4caf50";
  if (p >= 20) return "#e67e22";
  return "#de1802";
}

function BatteryIcon({ pct, size = 20 }) {
  const p = batteryLevel(pct);

  if (p == null) return null;

  if (p >= 75) return <PiBatteryVerticalFull size={size} />;
  if (p >= 50) return <PiBatteryVerticalHigh size={size} />;
  if (p >= 25) return <PiBatteryVerticalMedium size={size} />;

  return <PiBatteryVerticalLow size={size} />;
}

function AgoText({ date }) {
  if (!date) return null;

  const ago = minSecAgo(new Date(date));
  if (!ago) return null;

  return (
    <div
      style={{
        marginTop: "2px",
        fontSize: "11px",
        color: "#888",
      }}
    >
      {ago.min} 分 {String(ago.sec).padStart(2, "0")} 秒前
    </div>
  );
}

function TimeBlock({ label, date, borderTop = false }) {
  return (
    <div
      style={{
        marginTop: borderTop ? "2px" : "12px",
        paddingTop: borderTop ? "11px" : 0,
        borderTop: borderTop ? "1px solid #eee" : undefined,
      }}
    >
      <div
        style={{
          fontSize: "12px",
          color: "#777",
          marginBottom: "3px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: "#333",
        }}
      >
        {date
          ? formatTimeYYYYMMDD_HHMMSS(new Date(date))
          : "—"}
      </div>

      <AgoText date={date} />
    </div>
  );
}

export default function AdminDeviceBatteryModal({
  isOpen,
  device,
  onClose,
}) {
  if (!isOpen || !device) return null;

  const phone = device?.phone ?? {};

  const batteryPct = phone?.lastBatteryPct ?? null;
  const lastIsCharging = phone?.lastIsCharging;

  const lastChargingAt = phone?.lastChargingAt ?? null;
  const lastBatteryAt = phone?.lastBatteryAt ?? null;

  const {
    isEffectivelyCharging,
    inferredFromRecentCharging,
  } = getEffectiveChargingStatus({
    batteryPct,
    lastIsCharging,
    lastChargingAt,
  });

  const chargingText =
    isEffectivelyCharging
      ? "充電中"
      : lastIsCharging === false
        ? "非充電中"
        : "未知";

  const chargingColor =
    isEffectivelyCharging
      ? "#188038"
      : lastIsCharging === false
        ? "#de1802"
        : "#999";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(0, 0, 0, 0.22)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="電池狀態"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(330px, 92vw)",
          background: "#fff",
          borderRadius: "14px",
          boxShadow: "0 10px 35px rgba(0, 0, 0, 0.22)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 14px",
            borderBottom: "1px solid #eee",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              fontWeight: 700,
              fontSize: "15px",
            }}
          >
            <BatteryIcon pct={batteryPct} />
            <span>電池狀態</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            style={{
              border: 0,
              background: "transparent",
              fontSize: "22px",
              lineHeight: 1,
              cursor: "pointer",
              color: "#777",
              padding: "0 2px",
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "13px 15px 16px" }}>
          <div
            style={{
              fontSize: "11px",
              color: "#999",
              marginBottom: "12px",
              wordBreak: "break-all",
            }}
          >
            裝置 ID：{device.deviceId}
          </div>

          {/* Battery level */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "6px",
            }}
          >
            <span style={{ color: "#777", fontSize: "13px" }}>
              電量
            </span>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                fontWeight: 700,
                fontSize: "16px",
                color: batteryColor(batteryPct),
              }}
            >
              {batteryPct != null ? `${batteryPct}%` : "—"}
              {batteryPct != null ? (
                <BatteryIcon pct={batteryPct} size={18} />
              ) : null}
            </span>
          </div>

          {/* Charging status */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "14px",
            }}
          >
            <span style={{ color: "#777", fontSize: "13px" }}>
              目前狀態
            </span>

            <span
              style={{
                fontWeight: 700,
                fontSize: "13px",
                color: chargingColor,
              }}
            >
              {chargingText}

              {inferredFromRecentCharging ? (
                <span
                  style={{
                    marginLeft: "0px",
                    fontSize: "10px",
                    fontWeight: 400,
                    color: "#999",
                  }}
                >
                  （由近期充電情形判定）
                </span>
              ) : null}
            </span>
          </div>

          <TimeBlock
            label="最後一次電量回報時間"
            date={lastBatteryAt}
          />

          <TimeBlock
            label="最後一次回報仍在充電時間"
            date={lastChargingAt}
            borderTop
          />

        </div>
      </div>
    </div>
  );
}

