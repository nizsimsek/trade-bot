import type { DashboardState } from "../types/trading";

export function formatMaybe(value: number | null, prefix = "") {
  return value === null ? "-" : `${prefix}${value.toFixed(2)}`;
}

export function translateTrend(value: DashboardState["indicators"]["trend"]) {
  const map = {
    bullish: "Yukarı",
    bearish: "Aşağı",
    sideways: "Yatay",
    "warming-up": "Bekleniyor"
  };
  return map[value];
}

export function formatIstanbulTime(timestamp: number | null | undefined) {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestamp * 1000));
}
