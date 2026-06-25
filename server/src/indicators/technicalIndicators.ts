import type { Candle } from "../domain/trading.js";

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const value of values.slice(period)) {
    current = value * multiplier + current * (1 - multiplier);
  }
  return current;
}

export function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;

  for (let index = values.length - period; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const relativeStrength = avgGain / avgLoss;
  return 100 - 100 / (1 + relativeStrength);
}

export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length <= period) return null;
  const recent = candles.slice(-period);
  const trueRanges = recent.map((candle, index) => {
    const previousClose = candles[candles.length - period + index - 1]?.close ?? candle.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });
  return trueRanges.reduce((sum, value) => sum + value, 0) / period;
}

export function supportResistance(
  candles: Candle[],
  lookback = 60
): { support: number | null; supportTime: number | null; resistance: number | null; resistanceTime: number | null } {
  if (candles.length < 20) return { support: null, supportTime: null, resistance: null, resistanceTime: null };
  const recent = candles.slice(-lookback);
  const lows = recent.map((candle) => candle.low).sort((a, b) => a - b);
  const highs = recent.map((candle) => candle.high).sort((a, b) => b - a);
  const support = percentile(lows, 0.12);
  const resistance = percentile(highs, 0.12);

  return {
    support,
    supportTime: findNearestCandleTime(recent, support, "low"),
    resistance,
    resistanceTime: findNearestCandleTime(recent, resistance, "high")
  };
}

function percentile(sorted: number[], pct: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * pct)));
  return sorted[index];
}

function findNearestCandleTime(candles: Candle[], price: number, field: "low" | "high"): number | null {
  let nearest: Candle | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candle of candles) {
    const distance = Math.abs(candle[field] - price);
    if (distance <= nearestDistance) {
      nearest = candle;
      nearestDistance = distance;
    }
  }

  return nearest?.time ?? null;
}
