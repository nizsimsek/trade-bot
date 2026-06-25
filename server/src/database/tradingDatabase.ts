import type { AccountState, BotEvent, Candle, DatabaseStatus, PerformanceStats, Position, Trade } from "../domain/trading.js";

export interface CandleWriteContext {
  symbol: string;
  interval: string;
  source: string;
}

export interface TradingDatabase {
  getStatus(): DatabaseStatus;
  initialize(): Promise<void>;
  saveCandles(candles: Candle[], context: CandleWriteContext): Promise<void>;
  saveTrades(trades: Trade[]): Promise<void>;
  saveEvents(events: BotEvent[]): Promise<void>;
  saveAccountSnapshot(account: AccountState): Promise<void>;
  saveOpenPosition(position: Position | null): Promise<void>;
  loadTradesPage(limit: number, offset: number): Promise<Trade[]>;
  loadEventsPage(limit: number, offset: number, kinds?: BotEvent["kind"][]): Promise<BotEvent[]>;
  loadLatestAccountSnapshot(): Promise<AccountState | null>;
  loadRealizedPnl(): Promise<number>;
  loadPerformanceStats(maxDrawdownPct: number): Promise<PerformanceStats>;
  loadOpenPosition(): Promise<Position | null>;
  close(): Promise<void>;
}
