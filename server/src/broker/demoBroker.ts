import type { AccountState, BotEvent, Candle, Position, StrategySignal, Trade } from "../domain/trading.js";
import { round } from "../utils/math.js";

const STARTING_BALANCE = 100;
const RISK_PER_TRADE_PCT = 1;
const MAX_LEVERAGE = 8;
const DAILY_LOSS_LIMIT_PCT = 4;
const MAX_HISTORY_ITEMS = 5;
const EXIT_SLIPPAGE = 0.1;
const ROUND_TRIP_COMMISSION_RATE = 0.00004;

interface DemoBrokerOptions {
  startingBalance?: number;
  riskPerTradePct?: number;
  maxLeverage?: number;
  lossLimitPct?: number;
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
  private readonly lossLimitPct: number;
  private readonly maxHistoryItems: number;
  private peakEquity: number;

  constructor(options: DemoBrokerOptions = {}) {
    this.startingBalance = options.account?.startingBalance ?? options.startingBalance ?? STARTING_BALANCE;
    this.riskPerTradePct = options.account?.riskPerTradePct ?? options.riskPerTradePct ?? RISK_PER_TRADE_PCT;
    this.maxLeverage = options.account?.maxLeverage ?? options.maxLeverage ?? MAX_LEVERAGE;
    this.lossLimitPct = options.lossLimitPct ?? DAILY_LOSS_LIMIT_PCT;
    this.maxHistoryItems = options.maxHistoryItems ?? MAX_HISTORY_ITEMS;
    this.peakEquity = this.startingBalance;
    this.account = options.account ?? {
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
  }

  onCandle(candle: Candle, signal: StrategySignal): void {
    this.markToMarket(candle.close);
    this.tryExit(candle);
    this.updateDrawdown();

    if (this.account.balance <= this.startingBalance * (1 - this.lossLimitPct / 100)) {
      if (!this.account.dailyLossLimitHit) {
        this.account.dailyLossLimitHit = true;
        this.pushEvent("risk", "Zarar limiti", `Hesap %${this.lossLimitPct} zarar sınırına geldiği için yeni işlem durduruldu.`, candle.time);
      }
      return;
    }

    if (this.openPosition || !signal.proposedTrade || signal.action === "hold") return;
    this.open(signal, candle.time);
  }

  private open(signal: StrategySignal, time: number): void {
    const trade = signal.proposedTrade;
    if (!trade) return;

    const stopDistance = Math.abs(trade.entry - trade.stopLoss);
    if (stopDistance <= 0) return;

    const riskAmount = this.account.balance * (this.riskPerTradePct / 100);
    const riskSizedUnits = riskAmount / stopDistance;
    const leverageCappedUnits = (this.account.balance * this.maxLeverage) / trade.entry;
    const units = Math.max(0, Math.min(riskSizedUnits, leverageCappedUnits));
    const notional = units * trade.entry;

    if (units <= 0 || notional < 1) {
      this.pushEvent("risk", "Pozisyon çok küçük", "Risk ve kaldıraç sınırları altında anlamlı pozisyon açılamadı.", time);
      return;
    }

    this.openPosition = {
      id: crypto.randomUUID(),
      side: trade.side,
      openedAt: time,
      entry: round(trade.entry),
      stopLoss: round(trade.stopLoss),
      takeProfit: round(trade.takeProfit),
      units: round(units),
      riskAmount: round(riskAmount),
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

  private tryExit(candle: Candle): void {
    if (!this.openPosition) return;
    const position = this.openPosition;

    if (position.side === "long") {
      if (candle.low <= position.stopLoss) {
        this.close(position.stopLoss, "stop-loss", candle.time);
      } else if (candle.high >= position.takeProfit) {
        this.close(position.takeProfit, "take-profit", candle.time);
      }
      return;
    }

    if (candle.high >= position.stopLoss) {
      this.close(position.stopLoss, "stop-loss", candle.time);
    } else if (candle.low <= position.takeProfit) {
      this.close(position.takeProfit, "take-profit", candle.time);
    }
  }

  private close(exit: number, outcome: Trade["outcome"], time: number): void {
    if (!this.openPosition) return;
    const position = this.openPosition;
    const executedExit = this.applyExitSlippage(exit, position.side);
    const direction = position.side === "long" ? 1 : -1;
    const grossPnl = (executedExit - position.entry) * position.units * direction;
    const commission = position.notional * ROUND_TRIP_COMMISSION_RATE;
    const pnl = grossPnl - commission;
    const trade: Trade = {
      ...position,
      closedAt: time,
      exit: round(executedExit),
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

    this.pushEvent(
      "exit",
      outcome === "take-profit" ? "Take profit" : "Stop loss",
      `${position.side.toUpperCase()} işlem $${trade.exit} seviyesinde kapandı. PnL ${trade.pnl >= 0 ? "+" : ""}$${trade.pnl.toFixed(2)}. Çıkışta $${EXIT_SLIPPAGE.toFixed(2)} slippage ve komisyon simüle edildi.`,
      time
    );
  }

  private applyExitSlippage(exit: number, side: Position["side"]): number {
    return side === "long" ? exit - EXIT_SLIPPAGE : exit + EXIT_SLIPPAGE;
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
