import { DemoBroker, RISK_PER_TRADE_PCT } from "../broker/demoBroker.js";
import type { AccountState, Candle, DashboardState, PerformanceStats } from "../domain/trading.js";
import type { TradingDatabase } from "../database/tradingDatabase.js";
import type { MarketDataProvider } from "../market/providers/marketDataProvider.js";
import type { ApnsPushService } from "../push/apnsPushService.js";
import { analyze } from "../strategy/xauUsdStrategy.js";
import { round } from "../utils/math.js";

const HISTORY_PAGE_SIZE = 5;
const REST_SYNC_CANDLES = 30;
const TRADING_EVENT_KINDS = ["entry", "exit", "system", "risk"] as const;

const EMPTY_PERFORMANCE: PerformanceStats = {
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  winRate: 0,
  netPnl: 0,
  grossProfit: 0,
  grossLoss: 0,
  avgWin: 0,
  avgLoss: 0,
  profitFactor: 0,
  expectancy: 0,
  maxDrawdownPct: 0
};

export class TradingService {
  private broker = new DemoBroker();
  private candles: Candle[] = [];
  private lastAnalysis = analyze([]);
  private performance: PerformanceStats = EMPTY_PERFORMANCE;
  private lastRestSyncAt = 0;
  private restSyncRunning = false;

  constructor(
    private readonly marketDataProvider: MarketDataProvider,
    private readonly historyCandles: number,
    private readonly database: TradingDatabase,
    private readonly pushService?: ApnsPushService,
    private readonly restSyncSeconds = 180
  ) {}

  async initialize(): Promise<void> {
    await this.restoreRuntimeState();
    await this.refreshPerformance();
    const providerHistory = await this.marketDataProvider.getHistory(this.historyCandles);
    this.candles = await this.mergeWithStoredHistory(providerHistory);
    this.lastAnalysis = analyze(this.candles.slice(0, -1));
    await this.persistCandles(providerHistory, { overwrite: true });
    this.lastRestSyncAt = Date.now();
    await this.persistRuntimeState({ saveEvents: true });
    this.marketDataProvider.start();
  }

  getDashboardState(): DashboardState {
    return {
      marketData: this.marketDataProvider.getStatus(),
      database: this.database.getStatus(),
      candles: this.candles,
      indicators: this.lastAnalysis.indicators,
      signal: this.lastAnalysis.signal,
      account: this.broker.account,
      performance: {
        ...this.performance,
        maxDrawdownPct: this.broker.account.maxDrawdownPct
      },
      openPosition: this.broker.openPosition,
      trades: this.broker.trades.slice(0, HISTORY_PAGE_SIZE),
      events: this.broker.events.slice(0, HISTORY_PAGE_SIZE)
    };
  }

  async getTradesPage(limit = HISTORY_PAGE_SIZE, offset = 0) {
    const pageLimit = this.normalizePageLimit(limit);
    const pageOffset = this.normalizeOffset(offset);
    const items = await this.database.loadTradesPage(pageLimit + 1, pageOffset);

    return {
      items: items.slice(0, pageLimit),
      nextOffset: pageOffset + Math.min(items.length, pageLimit),
      hasMore: items.length > pageLimit
    };
  }

  async getTradingEventsPage(limit = HISTORY_PAGE_SIZE, offset = 0) {
    const pageLimit = this.normalizePageLimit(limit);
    const pageOffset = this.normalizeOffset(offset);
    const items = await this.database.loadEventsPage(pageLimit + 1, pageOffset, [...TRADING_EVENT_KINDS]);

    return {
      items: items.slice(0, pageLimit),
      nextOffset: pageOffset + Math.min(items.length, pageLimit),
      hasMore: items.length > pageLimit
    };
  }

  async tick(): Promise<DashboardState> {
    const candle = await this.marketDataProvider.next(this.candles);
    if (!candle) return this.getDashboardState();

    const last = this.candles.at(-1);
    const isNewCandle = !last || candle.time > last.time;
    if (last && candle.time === last.time) {
      this.candles[this.candles.length - 1] = candle;
    } else if (isNewCandle) {
      this.candles.push(candle);
      this.candles.splice(0, Math.max(0, this.candles.length - 360));
    } else {
      return this.getDashboardState();
    }
    const beforeTradeId = this.broker.trades[0]?.id ?? null;
    const beforeEventId = this.broker.events[0]?.id ?? null;
    const beforePositionId = this.broker.openPosition?.id ?? null;
    const beforeAccountKey = this.getAccountPersistenceKey();

    // Önce açık pozisyonun çıkışı güncel tick fiyatıyla kontrol edilir.
    this.broker.onPrice(candle.close, candle.time);
    // Sinyal mum başına bir kez, sadece kapanmış mumlarla üretilir (repaint yok).
    // Giriş yeni mumun ilk tick'inde yapılır; aynı mum içinde tekrar giriş olmaz.
    if (isNewCandle) {
      this.lastAnalysis = analyze(this.candles.slice(0, -1), { entryTime: candle.time });
      this.broker.tryOpen(this.lastAnalysis.signal, candle.close, candle.time);
    }

    const tradeChanged = beforeTradeId !== (this.broker.trades[0]?.id ?? null);
    const eventChanged = beforeEventId !== (this.broker.events[0]?.id ?? null);
    const positionChanged = beforePositionId !== (this.broker.openPosition?.id ?? null);
    const accountChanged = beforeAccountKey !== this.getAccountPersistenceKey();

    await this.persistCandles([candle]);
    await this.persistRuntimeState({
      saveTrades: tradeChanged,
      saveEvents: eventChanged,
      saveAccountSnapshot: accountChanged,
      saveOpenPosition: positionChanged
    });
    if (eventChanged) await this.notifyLatestEvent(beforeEventId);
    if (tradeChanged || accountChanged) await this.refreshPerformance();
    this.scheduleRestSync();
    return this.getDashboardState();
  }

  private scheduleRestSync(): void {
    if (this.restSyncRunning || Date.now() - this.lastRestSyncAt < this.restSyncSeconds * 1000) return;
    this.restSyncRunning = true;
    this.lastRestSyncAt = Date.now();
    void this.syncOfficialCandles().finally(() => {
      this.restSyncRunning = false;
    });
  }

  // WebSocket tick'leri seyrek gelir (mumların ~%37'si tek tick). Kapanmış mumları Twelve Data
  // REST'ten gelen resmi OHLC ile değiştirerek ATR ve kırılım kanalının gerçek volatiliteyi
  // görmesini sağlar.
  private async syncOfficialCandles(): Promise<void> {
    try {
      const official = await this.marketDataProvider.getRecentClosedCandles(REST_SYNC_CANDLES);
      const indexByTime = new Map(this.candles.map((candle, index) => [candle.time, index]));
      const forming = this.candles.at(-1)?.time ?? Number.POSITIVE_INFINITY;
      for (const candle of official) {
        const index = indexByTime.get(candle.time);
        if (index !== undefined && candle.time < forming) this.candles[index] = candle;
      }
      await this.persistCandles(official, { overwrite: true });
    } catch (error) {
      console.warn(`Resmi mum senkronizasyonu basarisiz: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async registerPushDevice(token: string): Promise<void> {
    await this.pushService?.registerDevice(token);
  }

  private async persistCandles(candles: Candle[], options: { overwrite?: boolean } = {}): Promise<void> {
    const status = this.marketDataProvider.getStatus();
    await this.database.saveCandles(candles, {
      symbol: status.symbol,
      interval: status.interval,
      source: status.provider
    }, options);
  }

  private async mergeWithStoredHistory(providerHistory: Candle[]): Promise<Candle[]> {
    const status = this.marketDataProvider.getStatus();
    const storedHistory = await this.database.loadRecentCandles({
      symbol: status.symbol,
      interval: status.interval,
      source: status.provider
    }, this.historyCandles);
    const byTime = new Map<number, Candle>();

    for (const candle of storedHistory) byTime.set(candle.time, candle);
    for (const candle of providerHistory) byTime.set(candle.time, candle);

    const merged = [...byTime.values()].sort((a, b) => a.time - b.time).slice(-this.historyCandles);
    if (merged.length < 200) {
      console.warn(`History mum sayisi ${merged.length}. EMA200 icin en az 200 mum gerekiyor.`);
    }

    return merged;
  }

  private async persistRuntimeState(options: {
    saveTrades?: boolean;
    saveEvents?: boolean;
    saveAccountSnapshot?: boolean;
    saveOpenPosition?: boolean;
  } = {}): Promise<void> {
    if (options.saveTrades) await this.database.saveTrades(this.broker.trades);
    if (options.saveEvents) await this.database.saveEvents(this.broker.events);
    if (options.saveAccountSnapshot) await this.database.saveAccountSnapshot(this.broker.account);
    if (options.saveOpenPosition) await this.database.saveOpenPosition(this.broker.openPosition);
  }

  private async notifyLatestEvent(previousEventId: string | null): Promise<void> {
    const event = this.broker.events[0];
    if (!event || event.id === previousEventId) return;
    await this.pushService?.notifyTradingEvent(event);
  }

  private async restoreRuntimeState(): Promise<void> {
    const [snapshot, realizedPnl, trades, events, openPosition] = await Promise.all([
      this.database.loadLatestAccountSnapshot(),
      this.database.loadRealizedPnl(),
      this.database.loadTradesPage(HISTORY_PAGE_SIZE, 0),
      this.database.loadEventsPage(HISTORY_PAGE_SIZE, 0, [...TRADING_EVENT_KINDS]),
      this.database.loadOpenPosition()
    ]);

    if (!snapshot && realizedPnl === 0 && trades.length === 0 && events.length === 0 && !openPosition) return;

    const account = this.rebuildAccount(snapshot, realizedPnl);

    this.broker = new DemoBroker({
      account,
      trades,
      events,
      openPosition
    });
  }

  private rebuildAccount(snapshot: AccountState | null, realizedPnl: number): AccountState {
    const startingBalance = snapshot?.startingBalance ?? 100;
    const balance = round(startingBalance + realizedPnl);
    const openPnl = snapshot?.openPnl ?? 0;

    return {
      startingBalance,
      balance,
      equity: round(balance + openPnl),
      realizedPnl: round(realizedPnl),
      openPnl,
      maxDrawdownPct: snapshot?.maxDrawdownPct ?? 0,
      dailyLossLimitHit: false,
      riskPerTradePct: RISK_PER_TRADE_PCT,
      maxLeverage: snapshot?.maxLeverage ?? 8
    };
  }

  private normalizePageLimit(limit: number): number {
    if (!Number.isFinite(limit)) return HISTORY_PAGE_SIZE;
    return Math.min(25, Math.max(1, Math.floor(limit)));
  }

  private normalizeOffset(offset: number): number {
    if (!Number.isFinite(offset)) return 0;
    return Math.max(0, Math.floor(offset));
  }

  private async refreshPerformance(): Promise<void> {
    this.performance = await this.database.loadPerformanceStats(this.broker.account.maxDrawdownPct);
  }

  private getAccountPersistenceKey(): string {
    const account = this.broker.account;
    return [
      account.startingBalance,
      account.balance,
      account.realizedPnl,
      account.dailyLossLimitHit,
      account.riskPerTradePct,
      account.maxLeverage
    ].join("|");
  }
}
