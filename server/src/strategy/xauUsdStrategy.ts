import { atr, donchian, ema, rsi } from "../indicators/technicalIndicators.js";
import type { Candle, IndicatorSnapshot, StrategySignal } from "../domain/trading.js";

// Trend yönünde momentum kırılımı. 1dk XAU/USD Twelve Data mumlarında (Tem-Eki 2026)
// geri çekilme ve ortalamaya dönüş stratejileri zarar ettiği halde, trend yönündeki
// kırılımlar dört ayrı dönemde de pozitif profit factor verdi.
const SPREAD = 0.25;
const BREAKOUT_LOOKBACK = 20;
const STOP_ATR = 1.5;
const TARGET_ATR = 2.5;
// SL mesafesi spread+slippage maliyetinin en az ~4 katı olmalı; yoksa maliyet kenarı yer.
const MIN_STOP_DISTANCE = 1;
const MAX_ENTRY_GAP_SECONDS = 30 * 60;
export const MAX_HOLD_SECONDS = 60 * 60;

interface AnalyzeOptions {
  // Sinyal kapanmış mumlar üzerinde hesaplanır; giriş bir sonraki mumun başında yapılır.
  entryTime?: number;
}

export function analyze(candles: Candle[], options: AnalyzeOptions = {}): { indicators: IndicatorSnapshot; signal: StrategySignal } {
  const closes = candles.map((candle) => candle.close);
  const current = candles[candles.length - 1];
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);
  const channel = donchian(candles.slice(0, -1), BREAKOUT_LOOKBACK);

  const trend = getTrend(ema50, ema200);
  const volatility = getVolatility(atr14, current?.close);
  const indicators: IndicatorSnapshot = {
    ema50,
    ema200,
    rsi14,
    atr14,
    support: channel?.low ?? null,
    supportTime: channel?.lowTime ?? null,
    resistance: channel?.high ?? null,
    resistanceTime: channel?.highTime ?? null,
    trend,
    volatility
  };

  return {
    indicators,
    signal: buildSignal(current, indicators, options.entryTime)
  };
}

function buildSignal(candle: Candle | undefined, indicators: IndicatorSnapshot, entryTime?: number): StrategySignal {
  const { ema50, ema200, atr14, support, resistance, trend } = indicators;

  if (!candle || !ema50 || !ema200 || !atr14 || support === null || resistance === null) {
    return {
      action: "hold",
      confidence: 0,
      title: "Veri birikiyor",
      summary: "Bot EMA200, ATR ve kırılım kanalını hesaplamak için yeterli mum bekliyor.",
      checklist: [
        { label: "Minimum veri", passed: false, value: "200+ mum gerekli" },
        { label: "İşlem", passed: false, value: "Bekle" }
      ]
    };
  }

  const price = candle.close;
  const time = entryTime ?? candle.time + 60;
  const stopDistance = atr14 * STOP_ATR;
  const session = getSessionState(time, candle.time);
  const bullishBreak = price > resistance;
  const bearishBreak = price < support;
  const enoughVolatility = stopDistance >= MIN_STOP_DISTANCE;

  const side = trend === "bullish" ? "long" : "short";
  const checklist = [
    { label: "Trend", passed: trend === "bullish" || trend === "bearish", value: labelTrend(trend) },
    {
      label: "Kırılım",
      passed: side === "long" ? bullishBreak : bearishBreak,
      value: side === "long"
        ? `Kapanış ${formatDistance(price - resistance)} ${BREAKOUT_LOOKBACK} mum zirvesi`
        : `Kapanış ${formatDistance(price - support)} ${BREAKOUT_LOOKBACK} mum dibi`
    },
    { label: "Volatilite", passed: enoughVolatility, value: `ATR $${atr14.toFixed(2)}, SL $${stopDistance.toFixed(2)}` },
    { label: "Seans", passed: session.open, value: session.label }
  ];
  const score = checklist.filter((check) => check.passed).length;
  const confidence = Math.round((score / checklist.length) * 100);

  if (score < checklist.length) {
    return {
      action: "hold",
      confidence,
      title: "İşlem yok",
      summary: "Trend yönünde kırılım bekleniyor. Bot kapanmış mumlarla karar verir, mum içi gürültüye girmez.",
      checklist
    };
  }

  if (side === "long") {
    const entry = price + SPREAD / 2;
    return {
      action: "buy",
      confidence,
      title: "Trend yönünde yukarı kırılım",
      summary: `EMA50 > EMA200 ve fiyat son ${BREAKOUT_LOOKBACK} mumun zirvesini kırdı. SL ${STOP_ATR} ATR, TP ${TARGET_ATR} ATR.`,
      checklist,
      proposedTrade: {
        side: "long",
        entry,
        stopLoss: entry - stopDistance,
        takeProfit: entry + atr14 * TARGET_ATR,
        riskReward: TARGET_ATR / STOP_ATR
      }
    };
  }

  const entry = price - SPREAD / 2;
  return {
    action: "sell",
    confidence,
    title: "Trend yönünde aşağı kırılım",
    summary: `EMA50 < EMA200 ve fiyat son ${BREAKOUT_LOOKBACK} mumun dibini kırdı. SL ${STOP_ATR} ATR, TP ${TARGET_ATR} ATR.`,
    checklist,
    proposedTrade: {
      side: "short",
      entry,
      stopLoss: entry + stopDistance,
      takeProfit: entry - atr14 * TARGET_ATR,
      riskReward: TARGET_ATR / STOP_ATR
    }
  };
}

export function getSessionState(time: number, lastCandleTime = time): { open: boolean; label: string } {
  const date = new Date(time * 1000);
  const minuteOfDay = date.getUTCHours() * 60 + date.getUTCMinutes();
  const weekday = date.getUTCDay();

  if (time - lastCandleTime > MAX_ENTRY_GAP_SECONDS) return { open: false, label: "Veri boşluğu sonrası ilk mum" };
  if (weekday === 6 || (weekday === 0 && minuteOfDay < 22 * 60 + 15)) return { open: false, label: "Hafta sonu kapalı" };
  if (weekday === 5 && minuteOfDay >= 20 * 60) return { open: false, label: "Cuma kapanışı yakın" };
  // 21:00 UTC günlük kapanış/rollover: spread açılır, fiyat boşluk yapar.
  if (minuteOfDay >= 20 * 60 + 45 && minuteOfDay < 22 * 60 + 15) return { open: false, label: "Rollover saati" };
  return { open: true, label: "Açık" };
}

export function shouldForceClose(time: number): boolean {
  const date = new Date(time * 1000);
  return date.getUTCDay() === 5 && date.getUTCHours() * 60 + date.getUTCMinutes() >= 20 * 60 + 50;
}

function getTrend(ema50: number | null, ema200: number | null): IndicatorSnapshot["trend"] {
  if (!ema50 || !ema200) return "warming-up";
  if (ema50 === ema200) return "sideways";
  return ema50 > ema200 ? "bullish" : "bearish";
}

function getVolatility(atrValue: number | null, price?: number): IndicatorSnapshot["volatility"] {
  if (!atrValue || !price) return "warming-up";
  const atrPct = atrValue / price;
  if (atrPct < 0.00015) return "low";
  if (atrPct > 0.0006) return "high";
  return "normal";
}

function labelTrend(trend: IndicatorSnapshot["trend"]): string {
  const labels = {
    bullish: "Yukarı (EMA50 > EMA200)",
    bearish: "Aşağı (EMA50 < EMA200)",
    sideways: "Yatay",
    "warming-up": "Hesaplanıyor"
  };
  return labels[trend];
}

function formatDistance(value: number): string {
  if (value === 0) return "tam";
  return value > 0 ? `$${value.toFixed(2)} üstünde` : `$${Math.abs(value).toFixed(2)} altında`;
}
