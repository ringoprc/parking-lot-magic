export function isBooleanAvailability(lot) {
  return lot?.availabilityMode === "boolean";
}

function toVacancyNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function hasNumberedAvailability(lot) {
  return !isBooleanAvailability(lot) && toVacancyNum(lot?.vacancy) != null;
}

export function mergeLotDisplayAvailability(lot, display) {
  if (!lot || !display) return lot;

  const next = {
    availabilityMode: display.availabilityMode ?? lot.availabilityMode,
    vacancy: display.vacancy ?? null,
    hasAvailableSpace: display.hasAvailableSpace ?? null,
    lastUpdated: display.at ?? null,
    status: display.status ?? "unknown",
    availabilitySource: display.source ?? "ai_history",
    availabilityReason: display.reason ?? "derived",
  };

  if (Object.entries(next).every(([key, value]) => lot[key] === value)) return lot;
  return { ...lot, ...next };
}

export function getAvailabilityDisplayValue(lot, unknownLabel = "未知") {
  if (isBooleanAvailability(lot)) {
    if (lot?.hasAvailableSpace === true) return "有";
    if (lot?.hasAvailableSpace === false) return "無";
    return unknownLabel;
  }

  return lot?.vacancy ?? unknownLabel;
}

export function getAvailabilityLongLabel(lot) {
  if (isBooleanAvailability(lot)) {
    if (lot?.hasAvailableSpace === true) return "有空位";
    if (lot?.hasAvailableSpace === false) return "無空位";
    return "空位未知";
  }

  return lot?.vacancy == null ? "空位未知" : `空位 ${lot.vacancy}`;
}

// Preserve the original list/detail colors for count-based lots.
export function getAvailabilityTextColor(lot) {
  if (isBooleanAvailability(lot)) {
    if (lot?.hasAvailableSpace === true) return "#0F7B2E";
    if (lot?.hasAvailableSpace === false) return "#C5221F";
    return "#b6b6b6";
  }

  const n = toVacancyNum(lot?.vacancy);
  if (n == null) return "#b6b6b6";
  if (n === 0) return "#C5221F";
  if (n <= 5) return "#C58F00";
  return "#0F7B2E";
}

// Preserve the map's original, slightly different unknown color and count checks.
export function getAvailabilityPinPresentation(lot) {
  if (isBooleanAvailability(lot)) {
    if (lot?.hasAvailableSpace === true) {
      return { bg: "#34A853", border: "#0F7B2E", glyph: "#FFFFFF", label: "有" };
    }
    if (lot?.hasAvailableSpace === false) {
      return { bg: "#EA4335", border: "#C5221F", glyph: "#FFFFFF", label: "無" };
    }
    return { bg: "#9AA0A6", border: "#5F6368", glyph: "#FFFFFF", label: "?" };
  }

  const vacancy = lot?.vacancy;
  if (vacancy == null) {
    return { bg: "#9AA0A6", border: "#5F6368", glyph: "#FFFFFF", label: "?" };
  }
  if (vacancy === 0) {
    return { bg: "#EA4335", border: "#C5221F", glyph: "#FFFFFF", label: vacancy };
  }
  if (vacancy <= 5) {
    return { bg: "#FBBC04", border: "#C58F00", glyph: "#202124", label: vacancy };
  }
  return { bg: "#34A853", border: "#0F7B2E", glyph: "#FFFFFF", label: vacancy };
}
