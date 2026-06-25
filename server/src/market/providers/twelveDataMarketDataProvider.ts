import WebSocket from "ws";
import type { Candle, MarketDataStatus } from "../../domain/trading.js";
import type { MarketDataProvider } from "./marketDataProvider.js";

interface TwelveDataTimeSeriesResponse {
  values?: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume?: string;
  }>;
  status?: string;
  message?: string;
  code?: number;
}

interface TwelveDataProviderOptions {
  symbol: string;
  interval: string;
  apiKey: string;
  baseUrl: string;
  wsUrl: string;
  timezone: string;
}

interface TwelveDataPriceMessage {
  event?: string;
  symbol?: string;
  price?: number | string;
  timestamp?: number;
}

export class TwelveDataMarketDataProvider implements MarketDataProvider {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private latestCandle: Candle | null = null;
  private pendingCandle: Candle | null = null;
  private connected = false;
  private started = false;
  private lastPrice: number | null = null;
  private lastTickAt: number | null = null;

  constructor(private readonly options: TwelveDataProviderOptions) {}

  getStatus(): MarketDataStatus {
    return {
      provider: "twelvedata",
      symbol: this.options.symbol,
      interval: this.options.interval,
      isLive: this.connected,
      source: this.options.wsUrl,
      transport: "websocket",
      lastPrice: this.lastPrice,
      lastTickAt: this.lastTickAt,
      message: this.connected
        ? "Twelve Data WebSocket ile canli fiyat tick'i aliniyor."
        : "Twelve Data WebSocket baglantisi bekleniyor."
    };
  }

  async getHistory(count: number): Promise<Candle[]> {
    const candles = await this.fetchCandles(count);
    this.latestCandle = candles.at(-1) ?? null;
    return candles;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connectWebSocket();
  }

  async next(currentCandles: Candle[]): Promise<Candle | null> {
    const pending = this.pendingCandle;
    if (!pending) return null;

    const current = currentCandles.at(-1);
    if (current && pending.time < current.time) {
      this.pendingCandle = null;
      return null;
    }

    this.pendingCandle = null;
    return pending;
  }

  private async fetchCandles(outputSize: number): Promise<Candle[]> {
    const url = new URL("/time_series", this.options.baseUrl);
    url.searchParams.set("symbol", this.options.symbol);
    url.searchParams.set("interval", this.options.interval);
    url.searchParams.set("outputsize", String(outputSize));
    url.searchParams.set("timezone", this.options.timezone);
    url.searchParams.set("apikey", this.options.apiKey);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Twelve Data HTTP ${response.status}: ${response.statusText}`);
    }

    const payload = (await response.json()) as TwelveDataTimeSeriesResponse;
    if (!payload.values?.length) {
      throw new Error(payload.message ?? "Twelve Data bos veri dondu.");
    }

    return payload.values
      .map((row) => ({
        time: parseTwelveDataTime(row.datetime),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume ?? 0)
      }))
      .filter((candle) => Number.isFinite(candle.time + candle.open + candle.high + candle.low + candle.close))
      .sort((a, b) => a.time - b.time);
  }

  private connectWebSocket(): void {
    this.clearReconnectTimer();
    this.clearHeartbeatTimer();

    const url = new URL(this.options.wsUrl);
    url.searchParams.set("apikey", this.options.apiKey);

    this.socket = new WebSocket(url);

    this.socket.on("open", () => {
      this.connected = true;
      this.socket?.send(JSON.stringify({
        action: "subscribe",
        params: { symbols: this.options.symbol }
      }));
      this.heartbeatTimer = setInterval(() => {
        if (this.socket?.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ action: "heartbeat" }));
        }
      }, 10000);
    });

    this.socket.on("message", (data) => this.handleSocketMessage(data.toString()));
    this.socket.on("close", () => this.scheduleReconnect());
    this.socket.on("error", () => this.scheduleReconnect());
  }

  private handleSocketMessage(raw: string): void {
    let message: TwelveDataPriceMessage;
    try {
      message = JSON.parse(raw) as TwelveDataPriceMessage;
    } catch {
      return;
    }

    if (message.event !== "price") return;
    if (message.symbol && message.symbol !== this.options.symbol) return;

    const price = Number(message.price);
    const timestamp = normalizeTickTimestamp(message.timestamp);
    if (!Number.isFinite(price) || !timestamp) return;

    this.lastPrice = price;
    this.lastTickAt = timestamp;

    const bucket = Math.floor(timestamp / intervalToSeconds(this.options.interval)) * intervalToSeconds(this.options.interval);
    const previous = this.latestCandle;
    const candle = previous && previous.time === bucket
      ? {
          ...previous,
          high: Math.max(previous.high, price),
          low: Math.min(previous.low, price),
          close: price
        }
      : {
          time: bucket,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 0
        };

    this.latestCandle = candle;
    this.pendingCandle = candle;
  }

  private scheduleReconnect(): void {
    this.connected = false;
    this.clearHeartbeatTimer();
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, 3000);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearHeartbeatTimer(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}

function parseTwelveDataTime(value: string): number {
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const normalized = hasExplicitTimezone ? value : `${value.replace(" ", "T")}Z`;
  return Math.floor(Date.parse(normalized) / 1000);
}

function normalizeTickTimestamp(value?: number): number | null {
  if (!value) return Math.floor(Date.now() / 1000);
  return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
}

function intervalToSeconds(interval: string): number {
  const match = interval.match(/^(\d+)(min|h|day)$/);
  if (!match) return 60;

  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "min") return amount * 60;
  if (unit === "h") return amount * 3600;
  return amount * 86400;
}
