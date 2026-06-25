import { loadEnvFile } from "./loadEnv.js";

loadEnvFile();

export interface ServerConfig {
  host: string;
  port: number;
  tickMs: number;
  jsonLimit: string;
  marketData: MarketDataConfig;
  database: DatabaseConfig;
}

export interface MarketDataConfig {
  symbol: string;
  interval: string;
  historyCandles: number;
  twelveData: {
    apiKey?: string;
    baseUrl: string;
    wsUrl: string;
    timezone: string;
  };
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
  connectionLimit: number;
  connectTimeoutMs: number;
  autoMigrate: boolean;
}

export const serverConfig: ServerConfig = {
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3501),
  tickMs: Number(process.env.TICK_MS ?? 1000),
  jsonLimit: process.env.JSON_LIMIT ?? "12mb",
  marketData: {
    symbol: process.env.MARKET_SYMBOL ?? "XAU/USD",
    interval: process.env.MARKET_INTERVAL ?? "1min",
    historyCandles: Number(process.env.MARKET_HISTORY_CANDLES ?? 260),
    twelveData: {
      apiKey: process.env.TWELVE_DATA_API_KEY,
      baseUrl: process.env.TWELVE_DATA_BASE_URL ?? "https://api.twelvedata.com",
      wsUrl: process.env.TWELVE_DATA_WS_URL ?? "wss://ws.twelvedata.com/v1/quotes/price",
      timezone: process.env.TWELVE_DATA_TIMEZONE ?? "UTC"
    }
  },
  database: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    name: process.env.DB_NAME ?? "daytrading",
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
    connectTimeoutMs: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 5000),
    autoMigrate: process.env.DB_AUTO_MIGRATE !== "false"
  }
};
