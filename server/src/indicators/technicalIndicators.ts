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
  // Wilder ATR: tum seri boyunca yumusatilir, son 14 mumun basit ortalamasindan daha kararlidir.
  let current = 0;
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const previousClose = candles[index - 1].close;
    const trueRange = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
    current = index <= period ? current + trueRange / period : (current * (period - 1) + trueRange) / period;
  }
  return current;
}

export function donchian(
  candles: Candle[],
  lookback = 20
): { high: number; highTime: number; low: number; lowTime: number } | null {
  if (candles.length < lookback) return null;
  const recent = candles.slice(-lookback);
  let highest = recent[0];
  let lowest = recent[0];

  for (const candle of recent) {
    if (candle.high >= highest.high) highest = candle;
    if (candle.low <= lowest.low) lowest = candle;
  }

  return { high: highest.high, highTime: highest.time, low: lowest.low, lowTime: lowest.time };
}
