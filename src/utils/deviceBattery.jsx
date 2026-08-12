// frontend/src/utils/deviceBattery.jsx
export const RECENT_CHARGING_GRACE_MS = 5 * 60 * 1000;

export function getEffectiveChargingStatus({
  batteryPct,
  lastIsCharging,
  lastChargingAt,
  nowMs = Date.now(),
}) {
  const lastChargingMs = lastChargingAt
    ? new Date(lastChargingAt).getTime()
    : null;

  const chargingAgeMs =
    Number.isFinite(lastChargingMs)
      ? nowMs - lastChargingMs
      : null;

  const recentlyCharging =
    chargingAgeMs != null &&
    chargingAgeMs >= 0 &&
    chargingAgeMs <= RECENT_CHARGING_GRACE_MS;

  // Android may report isCharging=false after reaching 100% even though
  // the device is still physically connected to power.
  const isEffectivelyCharging =
    lastIsCharging === true ||
    (Number(batteryPct) === 100 && recentlyCharging);

  const inferredFromRecentCharging =
    isEffectivelyCharging && lastIsCharging !== true;

  return {
    isEffectivelyCharging,
    recentlyCharging,
    inferredFromRecentCharging,
  };
}