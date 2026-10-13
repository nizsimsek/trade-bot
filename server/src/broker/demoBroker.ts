import type { AccountState, BotEvent, Position, StrategySignal, Trade } from "../domain/trading.js";
import { MAX_HOLD_SECONDS, shouldForceClose } from "../strategy/xauUsdStrategy.js";
import { round } from "../utils/math.js";

const STARTING_BALANCE = 100;
// 8x kaldıraç limiti ~$100 hesapta pozisyonu zaten ~0.2 oz ile sınırlar; gerçek risk SL
// mesafesine göre işlem başı ~%0.5-1.5 olur. %2 sadece çok geniş stoplarda devreye girer.
export const RISK_PER_TRADE_PCT = 2;
const MAX_LEVERAGE = 8;
const DAILY_LOSS_LIMIT_PCT = 6;
const MAX_HISTORY_ITEMS = 5;
const SPREAD = 0.25;
const EXIT_SLIPPAGE = 0.1;
const ROUND_TRIP_COMMISSION_RATE = 0.00004;

interface DemoBrokerOptions {
  startingBalance?: number;
  riskPerTradePct?: number;
  maxLeverage?: number;
  maxHistoryItems?: number;
  label?: string;
  account?: AccountState;
  openPosition?: Position | null;
  trades?: Trade[];
  events?: BotEvent[];
}

export class DemoBroker {
  account: AccountState;
  openPosition: Position | null = null;
  trades: Trade[] = [];
  events: BotEvent[];
  private readonly startingBalance: number;
  private readonly riskPerTradePct: number;
  private readonly maxLeverage: number;
  private readonly maxHistoryItems: number;
  private peakEquity: number;
  private tradingDay = -1;
  private dayStartBalance: number;

  constructor(options: DemoBrokerOptions = {}) {
    this.startingBalance = options.account?.startingBalance ?? options.startingBalance ?? STARTING_BALANCE;
    this.riskPerTradePct = options.riskPerTradePct ?? RISK_PER_TRADE_PCT;
    this.maxLeverage = options.account?.maxLeverage ?? options.maxLeverage ?? MAX_LEVERAGE;
    this.maxHistoryItems = options.maxHistoryItems ?? MAX_HISTORY_ITEMS;
    this.peakEquity = this.startingBalance;
    this.account = options.account ? {
      ...options.account,
      dailyLossLimitHit: false,
      riskPerTradePct: this.riskPerTradePct
    } : {
      startingBalance: this.startingBalance,
      balance: this.startingBalance,
      equity: this.startingBalance,
      realizedPnl: 0,
      openPnl: 0,
      maxDrawdownPct: 0,
      dailyLossLimitHit: false,
      riskPerTradePct: this.riskPerTradePct,
      maxLeverage: this.maxLeverage
    };
    this.openPosition = options.openPosition ?? null;
    this.trades = options.trades?.slice(0, this.maxHistoryItems) ?? [];
    this.events = options.events?.length
      ? options.events.slice(0, this.maxHistoryItems)
      : [{
          id: crypto.randomUUID(),
          time: Math.floor(Date.now() / 1000),
          kind: "system",
          title: `${options.label ?? "Demo"} hesap başlatıldı`,
          message: `Başlangıç sermayesi ${this.startingBalance} USD. İşlem başı risk %${this.riskPerTradePct}, aynı anda tek pozisyon.`
        }];
    this.peakEquity = Math.max(this.peakEquity, this.account.equity, this.account.balance);
    this.dayStartBalance = this.account.balance;
  }

  // Her fiyat tick'inde çağrılır. Çıkışlar sadece pozisyon açıldıktan SONRA gelen fiyatlarla
  // kontrol edilir; mumun giriş öncesi high/low değerleri pozisyonu kapatamaz.
  onPrice(price: number, time: number): void {
    this.rollTradingDay(time);
    this.markToMarket(price);
    this.tryExit(price, time);
    this.updateDrawdown();
  }

  // Yeni mum başladığında, kapanmış mumlardan üretilen sinyalle çağrılır.
  tryOpen(signal: StrategySignal, price: number, time: number): void {
    if (this.openPosition || !signal.proposedTrade || signal.action === "hold") return;
    this.rollTradingDay(time);
    if (this.account.dailyLossLimitHit) return;
    this.open(signal, price, time);
  }

  private rollTradingDay(time: number): void {
    const day = Math.floor(time / 86400);
    if (day === this.tradingDay) return;
    if (this.tradingDay !== -1) this.dayStartBalance = this.account.balance;
    this.tradingDay = day;
    this.account.dailyLossLimitHit = false;
  }

  private open(signal: StrategySignal, price: number, time: number): void {
    const trade = signal.proposedTrade;
    if (!trade) return;

    // SL/TP mesafeleri sinyalden alınır ve gerçek giriş fiyatına taşınır.
    const direction = trade.side === "long" ? 1 : -1;
    const entry = price + direction * (SPREAD / 2);
    const stopDistance = Math.abs(trade.entry - trade.stopLoss);
    const targetDistance = Math.abs(trade.takeProfit - trade.entry);
    if (stopDistance <= 0 || targetDistance <= 0) return;

    const riskAmount = this.account.balance * (this.riskPerTradePct / 100);
    const riskSizedUnits = riskAmount / stopDistance;
    const leverageCappedUnits = (this.account.balance * this.maxLeverage) / entry;
    const units = Math.max(0, Math.min(riskSizedUnits, leverageCappedUnits));
    const notional = units * entry;

    if (units <= 0 || notional < 1) {
      this.pushEvent("risk", "Pozisyon çok küçük", "Risk ve kaldıraç sınırları altında anlamlı pozisyon açılamadı.", time);
      return;
    }

    this.openPosition = {
      id: crypto.randomUUID(),
      side: trade.side,
      openedAt: time,
      entry: round(entry),
      stopLoss: round(entry - direction * stopDistance),
      takeProfit: round(entry + direction * targetDistance),
      units: round(units),
      // Gösterilen risk, kaldıraç limitinden sonra SL'de kaybedilecek gerçek tutardır.
      riskAmount: round(units * stopDistance),
      notional: round(notional),
      marginUsed: round(notional / this.maxLeverage),
      confidence: signal.confidence,
      reason: signal.summary
    };

    this.pushEvent(
      "entry",
      trade.side === "long" ? "Long açıldı" : "Short açıldı",
      `${signal.title}. Entry $${this.openPosition.entry}, SL $${this.openPosition.stopLoss}, TP $${this.openPosition.takeProfit}.`,
      time
    );
  }

  private tryExit(price: number, time: number): void {
    if (!this.openPosition) return;
    const position = this.openPosition;
    const direction = position.side === "long" ? 1 : -1;
    const move = (price - position.entry) * direction;

    // Stop piyasa emri gibi dolar: fiyat SL'nin ötesine sıçradıysa gerçek fiyattan kapanır.
    if (move <= (position.stopLoss - position.entry) * direction) {
      const fill = direction === 1 ? Math.min(price, position.stopLoss) : Math.max(price, position.stopLoss);
      this.close(fill - direction * EXIT_SLIPPAGE, "stop-loss", time);
    } else if (move >= (position.takeProfit - position.entry) * direction) {
      this.close(position.takeProfit, "take-profit", time);
    } else if (time - position.openedAt >= MAX_HOLD_SECONDS || shouldForceClose(time)) {
      this.close(price - direction * EXIT_SLIPPAGE, "time-exit", time);
    }
  }

  private close(exit: number, outcome: Trade["outcome"], time: number): void {
    if (!this.openPosition) return;
    const position = this.openPosition;
    const direction = position.side === "long" ? 1 : -1;
    const grossPnl = (exit - position.entry) * position.units * direction;
    const commission = position.notional * ROUND_TRIP_COMMISSION_RATE;
    const pnl = grossPnl - commission;
    const trade: Trade = {
      ...position,
      closedAt: time,
      exit: round(exit),
      pnl: round(pnl),
      pnlPct: round((pnl / this.account.balance) * 100),
      outcome,
      durationCandles: Math.max(1, Math.round((time - position.openedAt) / 60))
    };

    this.trades.unshift(trade);
    this.trades = this.trades.slice(0, this.maxHistoryItems);
    this.account.balance = round(this.account.balance + pnl);
    this.account.realizedPnl = round(this.account.balance - this.startingBalance);
    this.openPosition = null;
    this.markToMarket(exit);

    const titles = { "take-profit": "Take profit", "stop-loss": "Stop loss", "time-exit": "Süre doldu" };
    this.pushEvent(
      "exit",
      titles[outcome],
      `${position.side.toUpperCase()} işlem $${trade.exit} seviyesinde kapandı. PnL ${trade.pnl >= 0 ? "+" : ""}$${trade.pnl.toFixed(2)}. Spread, slippage ve komisyon simüle edildi.`,
      time
    );
    this.checkDailyLossLimit(time);
  }

  private checkDailyLossLimit(time: number): void {
    if (this.account.dailyLossLimitHit) return;
    if (this.account.balance > this.dayStartBalance * (1 - DAILY_LOSS_LIMIT_PCT / 100)) return;
    this.account.dailyLossLimitHit = true;
    this.pushEvent("risk", "Günlük zarar limiti", `Gün içi zarar %${DAILY_LOSS_LIMIT_PCT} sınırına ulaştı. Yeni işlemler UTC gün sonuna kadar durduruldu.`, time);
  }

  private markToMarket(price: number): void {
    if (!this.openPosition) {
      this.account.openPnl = 0;
      this.account.equity = this.account.balance;
      return;
    }

    const direction = this.openPosition.side === "long" ? 1 : -1;
    const pnl = (price - this.openPosition.entry) * this.openPosition.units * direction;
    this.account.openPnl = round(pnl);
    this.account.equity = round(this.account.balance + pnl);
  }

  private updateDrawdown(): void {
    this.peakEquity = Math.max(this.peakEquity, this.account.equity);
    const drawdownPct = Math.max(0, ((this.peakEquity - this.account.equity) / this.peakEquity) * 100);
    this.account.maxDrawdownPct = round(Math.max(this.account.maxDrawdownPct, drawdownPct));
  }

  private pushEvent(kind: BotEvent["kind"], title: string, message: string, time: number): void {
    this.events.unshift({
      id: crypto.randomUUID(),
      time,
      kind,
      title,
      message
    });
    this.events = this.events.slice(0, this.maxHistoryItems);
  }
}
