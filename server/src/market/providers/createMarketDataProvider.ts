import type { MarketDataConfig } from "../../config/env.js";
import { TwelveDataMarketDataProvider } from "./twelveDataMarketDataProvider.js";
import type { MarketDataProvider } from "./marketDataProvider.js";

export function createMarketDataProvider(config: MarketDataConfig): MarketDataProvider {
  if (!config.twelveData.apiKey) {
    throw new Error("TWELVE_DATA_API_KEY zorunlu.");
  }

  return new TwelveDataMarketDataProvider({
    symbol: config.symbol,
    interval: config.interval,
    apiKey: config.twelveData.apiKey,
    baseUrl: config.twelveData.baseUrl,
    wsUrl: config.twelveData.wsUrl,
    timezone: config.twelveData.timezone
  });
}
