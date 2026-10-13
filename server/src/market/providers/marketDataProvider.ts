import type { Candle, MarketDataStatus } from "../../domain/trading.js";

export interface MarketDataProvider {
  getStatus(): MarketDataStatus;
  getHistory(count: number): Promise<Candle[]>;
  // Son kapanmis mumlarin resmi OHLC degerleri. WebSocket tick'leri seyrek oldugu icin
  // tick'lerden kurulan mumlar gercek high/low'u kacirir.
  getRecentClosedCandles(count: number): Promise<Candle[]>;
  start(): void;
  next(currentCandles: Candle[]): Promise<Candle | null>;
}
