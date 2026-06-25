import { atr, ema, rsi, supportResistance } from "../indicators/technicalIndicators.js";
import type { Candle, IndicatorSnapshot, StrategySignal } from "../domain/trading.js";

const SPREAD = 0.25;
const TARGET_RISK_REWARD = 1.8;
const MIN_RISK_REWARD = 1.2;
const STRUCTURE_BUFFER_ATR = 0.2;

export function analyze(candles: Candle[]): { indicators: IndicatorSnapshot; signal: StrategySignal } {
  const closes = candles.map((candle) => candle.close);
  const current = candles[candles.length - 1];
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);
  const { support, supportTime, resistance, resistanceTime } = supportResistance(candles);

  const trend = getTrend(ema50, ema200);
  const volatility = getVolatility(atr14, current?.close);
  const indicators: IndicatorSnapshot = { ema50, ema200, rsi14, atr14, support, supportTime, resistance, resistanceTime, trend, volatility };

  return {
    indicators,
    signal: buildSignal(current, indicators)
  };
}

function buildSignal(candle: Candle, indicators: IndicatorSnapshot): StrategySignal {
  const { ema50, ema200, rsi14, atr14, support, resistance, trend, volatility } = indicators;

  if (!ema50 || !ema200 || !rsi14 || !atr14 || !support || !resistance) {
    return {
      action: "hold",
      confidence: 0,
      title: "Veri birikiyor",
      summary: "Bot EMA200, ATR ve destek/direnç hesaplamak için yeterli mum bekliyor.",
      checklist: [
        { label: "Minimum veri", passed: false, value: "200+ mum gerekli" },
        { label: "İşlem", passed: false, value: "Bekle" }
      ]
    };
  }

  const price = candle.close;
  const distanceToSupport = price - support;
  const distanceToResistance = resistance - price;
  const nearEma50 = Math.abs(price - ema50) <= atr14 * 0.75;
  const bullishMomentum = rsi14 >= 48 && rsi14 <= 66;
  const bearishMomentum = rsi14 <= 52 && rsi14 >= 34;
  const enoughRoomLong = distanceToResistance > atr14 * 1.6;
  const enoughRoomShort = distanceToSupport > atr14 * 1.6;
  const normalVolatility = volatility === "normal" || volatility === "high";

  const longChecks = [
    { label: "Trend", passed: trend === "bullish", value: labelTrend(trend) },
    { label: "Pullback", passed: nearEma50, value: `Fiyat EMA50'ye ${formatDistance(price - ema50)} yakın` },
    { label: "Momentum", passed: bullishMomentum, value: `RSI ${rsi14.toFixed(1)}` },
    { label: "Direnç mesafesi", passed: enoughRoomLong, value: `$${distanceToResistance.toFixed(2)} alan` },
    { label: "Volatilite", passed: normalVolatility, value: `ATR $${atr14.toFixed(2)}` }
  ];

  const shortChecks = [
    { label: "Trend", passed: trend === "bearish", value: labelTrend(trend) },
    { label: "Pullback", passed: nearEma50, value: `Fiyat EMA50'ye ${formatDistance(price - ema50)} yakın` },
    { label: "Momentum", passed: bearishMomentum, value: `RSI ${rsi14.toFixed(1)}` },
    { label: "Destek mesafesi", passed: enoughRoomShort, value: `$${distanceToSupport.toFixed(2)} alan` },
    { label: "Volatilite", passed: normalVolatility, value: `ATR $${atr14.toFixed(2)}` }
  ];

  const longScore = longChecks.filter((check) => check.passed).length;
  const shortScore = shortChecks.filter((check) => check.passed).length;

  if (longScore >= 4 && longScore > shortScore) {
    const entry = price + SPREAD / 2;
    const stopLoss = Math.min(entry - atr14 * 1.25, support - atr14 * STRUCTURE_BUFFER_ATR);
    const risk = entry - stopLoss;
    const structureTarget = resistance - atr14 * STRUCTURE_BUFFER_ATR;
    const takeProfit = Math.min(entry + risk * TARGET_RISK_REWARD, structureTarget);
    const riskReward = (takeProfit - entry) / risk;
    if (riskReward < MIN_RISK_REWARD) {
      return holdSignal(longChecks, "Long hedefi dirençten önce yeterli risk/ödül bırakmıyor.");
    }
    return {
      action: "buy",
      confidence: Math.round((longScore / longChecks.length) * 100),
      title: "Trend yönünde long fırsatı",
      summary: "Altın yukarı trendde, fiyat EMA50 civarında dinlenmiş ve TP direnç bölgesinden önce konumlanıyor.",
      checklist: longChecks,
      proposedTrade: { side: "long", entry, stopLoss, takeProfit, riskReward }
    };
  }

  if (shortScore >= 4 && shortScore > longScore) {
    const entry = price - SPREAD / 2;
    const stopLoss = Math.max(entry + atr14 * 1.25, resistance + atr14 * STRUCTURE_BUFFER_ATR);
    const risk = stopLoss - entry;
    const structureTarget = support + atr14 * STRUCTURE_BUFFER_ATR;
    const takeProfit = Math.max(entry - risk * TARGET_RISK_REWARD, structureTarget);
    const riskReward = (entry - takeProfit) / risk;
    if (riskReward < MIN_RISK_REWARD) {
      return holdSignal(shortChecks, "Short hedefi destekten önce yeterli risk/ödül bırakmıyor.");
    }
    return {
      action: "sell",
      confidence: Math.round((shortScore / shortChecks.length) * 100),
      title: "Trend yönünde short fırsatı",
      summary: "Altın aşağı trendde, fiyat EMA50 bölgesine tepki vermiş ve TP destek bölgesinden önce konumlanıyor.",
      checklist: shortChecks,
      proposedTrade: { side: "short", entry, stopLoss, takeProfit, riskReward }
    };
  }

  const bestChecks = pickBestChecklist([
    { score: longScore, checks: longChecks },
    { score: shortScore, checks: shortChecks }
  ]);
  return {
    action: "hold",
    confidence: Math.round((bestChecks.filter((check) => check.passed).length / bestChecks.length) * 100),
    title: "İşlem yok",
    summary: "Kurallar yeterince hizalanmadı. Bot düşük kaliteli setup yerine beklemeyi seçiyor.",
    checklist: bestChecks
  };
}

function pickBestChecklist(candidates: Array<{ score: number; checks: StrategySignal["checklist"] }>) {
  return candidates.reduce((best, current) => (current.score > best.score ? current : best)).checks;
}

function holdSignal(checklist: StrategySignal["checklist"], summary: string): StrategySignal {
  return {
    action: "hold",
    confidence: Math.round((checklist.filter((check) => check.passed).length / checklist.length) * 100),
    title: "İşlem yok",
    summary,
    checklist
  };
}

function getTrend(ema50: number | null, ema200: number | null): IndicatorSnapshot["trend"] {
  if (!ema50 || !ema200) return "warming-up";
  const gapPct = Math.abs(ema50 - ema200) / ema200;
  if (gapPct < 0.0012) return "sideways";
  return ema50 > ema200 ? "bullish" : "bearish";
}

function getVolatility(atrValue: number | null, price?: number): IndicatorSnapshot["volatility"] {
  if (!atrValue || !price) return "warming-up";
  const atrPct = atrValue / price;
  if (atrPct < 0.00045) return "low";
  if (atrPct > 0.0015) return "high";
  return "normal";
}

function labelTrend(trend: IndicatorSnapshot["trend"]): string {
  const labels = {
    bullish: "Yukarı",
    bearish: "Aşağı",
    sideways: "Yatay",
    "warming-up": "Hesaplanıyor"
  };
  return labels[trend];
}

function formatDistance(value: number): string {
  if (value === 0) return "tam";
  return value > 0 ? `$${value.toFixed(2)} üstünde` : `$${Math.abs(value).toFixed(2)} altında`;
}
