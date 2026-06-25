import type { Candle } from "../types/trading";
import type { UTCTimestamp } from "lightweight-charts";

export function lineData(candles: Candle[], period: number) {
  const multiplier = 2 / (period + 1);
  let current: number | null = null;

  return candles
    .map((candle, index) => {
      if (index + 1 < period) return null;
      if (index + 1 === period) {
        current = candles.slice(0, period).reduce((sum, item) => sum + item.close, 0) / period;
      } else if (current !== null) {
        current = candle.close * multiplier + current * (1 - multiplier);
      }

      return current === null ? null : { time: candle.time as UTCTimestamp, value: current };
    })
    .filter(Boolean) as Array<{ time: UTCTimestamp; value: number }>;
}
