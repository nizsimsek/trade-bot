import type { Candle, MarketDataStatus } from "../../domain/trading.js";

export interface MarketDataProvider {
  getStatus(): MarketDataStatus;
  getHistory(count: number): Promise<Candle[]>;
  start(): void;
  next(currentCandles: Candle[]): Promise<Candle | null>;
}
