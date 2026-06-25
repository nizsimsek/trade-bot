import mysql, { type Pool } from "mysql2/promise";
import type { DatabaseConfig } from "../config/env.js";
import type { AccountState, BotEvent, Candle, PerformanceStats, Position, Trade } from "../domain/trading.js";
import type { CandleWriteContext, TradingDatabase } from "./tradingDatabase.js";
import { round } from "../utils/math.js";

export class MySqlTradingDatabase implements TradingDatabase {
  private pool: Pool | null = null;
  private connected = false;

  constructor(private readonly config: DatabaseConfig) {}

  getStatus() {
    return {
      connected: this.connected,
      dialect: "mysql" as const,
      database: this.config.name,
      host: `${this.config.host}:${this.config.port}`,
      message: this.connected
        ? `MySQL bagli. Veriler ${this.config.name} veritabanina yaziliyor.`
        : "MySQL etkin ama baglanti henuz kurulmus degil."
    };
  }

  async initialize(): Promise<void> {
    const bootstrap = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      connectTimeout: this.config.connectTimeoutMs,
      multipleStatements: true
    });
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${this.config.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await bootstrap.end();

    this.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.name,
      connectionLimit: this.config.connectionLimit,
      connectTimeout: this.config.connectTimeoutMs,
      namedPlaceholders: true
    });

    if (this.config.autoMigrate) {
      await this.migrate();
    }

    this.connected = true;
  }

  async saveCandles(candles: Candle[], context: CandleWriteContext): Promise<void> {
    if (!candles.length) return;
    const pool = this.requirePool();
    await pool.query(
      `INSERT IGNORE INTO market_candles
        (symbol, interval_name, source, time, open, high, low, close, volume)
       VALUES ?
       ON DUPLICATE KEY UPDATE
         high = GREATEST(high, VALUES(high)),
         low = LEAST(low, VALUES(low)),
         close = VALUES(close),
         volume = VALUES(volume)`,
      [candles.map((candle) => [
        context.symbol,
        context.interval,
        context.source,
        candle.time,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume
      ])]
    );
  }

  async saveTrades(trades: Trade[]): Promise<void> {
    if (!trades.length) return;
    const pool = this.requirePool();
    await pool.query(
      `INSERT IGNORE INTO demo_trades
        (id, side, opened_at, closed_at, entry, stop_loss, take_profit, exit_price, units, risk_amount, notional, margin_used, confidence, reason, pnl, pnl_pct, outcome, duration_candles)
       VALUES ?`,
      [trades.map((trade) => [
        trade.id,
        trade.side,
        trade.openedAt,
        trade.closedAt,
        trade.entry,
        trade.stopLoss,
        trade.takeProfit,
        trade.exit,
        trade.units,
        trade.riskAmount,
        trade.notional,
        trade.marginUsed,
        trade.confidence,
        trade.reason,
        trade.pnl,
        trade.pnlPct,
        trade.outcome,
        trade.durationCandles
      ])]
    );
  }

  async saveEvents(events: BotEvent[]): Promise<void> {
    if (!events.length) return;
    const pool = this.requirePool();
    await pool.query(
      `INSERT IGNORE INTO bot_events (id, time, kind, title, message) VALUES ?`,
      [events.map((event) => [event.id, event.time, event.kind, event.title, event.message])]
    );
  }

  async saveAccountSnapshot(account: AccountState): Promise<void> {
    const pool = this.requirePool();
    await pool.query(
      `INSERT INTO account_snapshots
        (time, starting_balance, balance, equity, realized_pnl, open_pnl, max_drawdown_pct, daily_loss_limit_hit, risk_per_trade_pct, max_leverage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Math.floor(Date.now() / 1000),
        account.startingBalance,
        account.balance,
        account.equity,
        account.realizedPnl,
        account.openPnl,
        account.maxDrawdownPct,
        account.dailyLossLimitHit,
        account.riskPerTradePct,
        account.maxLeverage
      ]
    );
  }

  async saveOpenPosition(position: Position | null): Promise<void> {
    const pool = this.requirePool();
    await pool.query("DELETE FROM open_positions");
    if (!position) return;

    await pool.query(
      `INSERT INTO open_positions
        (id, side, opened_at, entry, stop_loss, take_profit, units, risk_amount, notional, margin_used, confidence, reason, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        position.id,
        position.side,
        position.openedAt,
        position.entry,
        position.stopLoss,
        position.takeProfit,
        position.units,
        position.riskAmount,
        position.notional,
        position.marginUsed,
        position.confidence,
        position.reason,
        Math.floor(Date.now() / 1000)
      ]
    );
  }

  async loadTradesPage(limit: number, offset: number): Promise<Trade[]> {
    const pool = this.requirePool();
    const [rows] = await pool.query(
      `SELECT id, side, opened_at, closed_at, entry, stop_loss, take_profit, exit_price, units, risk_amount,
              notional, margin_used, confidence, reason, pnl, pnl_pct, outcome, duration_candles
       FROM demo_trades
       ORDER BY closed_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      side: row.side === "long" ? "long" : "short",
      openedAt: Number(row.opened_at),
      closedAt: Number(row.closed_at),
      entry: Number(row.entry),
      stopLoss: Number(row.stop_loss),
      takeProfit: Number(row.take_profit),
      exit: Number(row.exit_price),
      units: Number(row.units),
      riskAmount: Number(row.risk_amount),
      notional: Number(row.notional),
      marginUsed: Number(row.margin_used),
      confidence: Number(row.confidence),
      reason: String(row.reason),
      pnl: Number(row.pnl),
      pnlPct: Number(row.pnl_pct),
      outcome: row.outcome === "take-profit" ? "take-profit" : "stop-loss",
      durationCandles: Number(row.duration_candles)
    }));
  }

  async loadEventsPage(limit: number, offset: number, kinds?: BotEvent["kind"][]): Promise<BotEvent[]> {
    const pool = this.requirePool();
    const kindFilter = kinds?.length ? `WHERE kind IN (${kinds.map(() => "?").join(", ")})` : "";
    const [rows] = await pool.query(
      `SELECT id, time, kind, title, message
       FROM bot_events
       ${kindFilter}
       ORDER BY time DESC
       LIMIT ? OFFSET ?`,
      [...(kinds ?? []), limit, offset]
    );

    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      time: Number(row.time),
      kind: this.mapEventKind(row.kind),
      title: String(row.title),
      message: String(row.message)
    }));
  }

  async loadLatestAccountSnapshot(): Promise<AccountState | null> {
    const pool = this.requirePool();
    const [rows] = await pool.query(
      `SELECT starting_balance, balance, equity, realized_pnl, open_pnl, max_drawdown_pct,
              daily_loss_limit_hit, risk_per_trade_pct, max_leverage
       FROM account_snapshots
       ORDER BY id DESC
       LIMIT 1`
    );
    const row = (rows as Array<Record<string, unknown>>)[0];
    if (!row) return null;

    return {
      startingBalance: Number(row.starting_balance),
      balance: Number(row.balance),
      equity: Number(row.equity),
      realizedPnl: Number(row.realized_pnl),
      openPnl: Number(row.open_pnl),
      maxDrawdownPct: Number(row.max_drawdown_pct),
      dailyLossLimitHit: Boolean(row.daily_loss_limit_hit),
      riskPerTradePct: Number(row.risk_per_trade_pct),
      maxLeverage: Number(row.max_leverage)
    };
  }

  async loadRealizedPnl(): Promise<number> {
    const pool = this.requirePool();
    const [rows] = await pool.query("SELECT COALESCE(SUM(pnl), 0) AS realized_pnl FROM demo_trades");
    const row = (rows as Array<Record<string, unknown>>)[0];
    return Number(row?.realized_pnl ?? 0);
  }

  async loadPerformanceStats(maxDrawdownPct: number): Promise<PerformanceStats> {
    const pool = this.requirePool();
    const [rows] = await pool.query(
      `SELECT
         COUNT(*) AS total_trades,
         SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS winning_trades,
         SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) AS losing_trades,
         COALESCE(SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END), 0) AS gross_profit,
         COALESCE(SUM(CASE WHEN pnl < 0 THEN ABS(pnl) ELSE 0 END), 0) AS gross_loss,
         COALESCE(SUM(pnl), 0) AS net_pnl,
         COALESCE(AVG(CASE WHEN pnl > 0 THEN pnl END), 0) AS avg_win,
         COALESCE(AVG(CASE WHEN pnl < 0 THEN ABS(pnl) END), 0) AS avg_loss
       FROM demo_trades`
    );
    const row = (rows as Array<Record<string, unknown>>)[0] ?? {};
    const totalTrades = Number(row.total_trades ?? 0);
    const winningTrades = Number(row.winning_trades ?? 0);
    const losingTrades = Number(row.losing_trades ?? 0);
    const grossProfit = Number(row.gross_profit ?? 0);
    const grossLoss = Number(row.gross_loss ?? 0);
    const avgWin = Number(row.avg_win ?? 0);
    const avgLoss = Number(row.avg_loss ?? 0);
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const lossRate = totalTrades > 0 ? losingTrades / totalTrades : 0;
    const winRateRatio = totalTrades > 0 ? winningTrades / totalTrades : 0;

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate: round(winRate),
      netPnl: round(Number(row.net_pnl ?? 0)),
      grossProfit: round(grossProfit),
      grossLoss: round(grossLoss),
      avgWin: round(avgWin),
      avgLoss: round(avgLoss),
      profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : totalTrades > 0 ? null : 0,
      expectancy: round(winRateRatio * avgWin - lossRate * avgLoss),
      maxDrawdownPct
    };
  }

  async loadOpenPosition(): Promise<Position | null> {
    const pool = this.requirePool();
    const [rows] = await pool.query(
      `SELECT id, side, opened_at, entry, stop_loss, take_profit, units, risk_amount,
              notional, margin_used, confidence, reason
       FROM open_positions
       ORDER BY updated_at DESC
       LIMIT 1`
    );
    const row = (rows as Array<Record<string, unknown>>)[0];
    if (!row) return null;

    return {
      id: String(row.id),
      side: row.side === "long" ? "long" : "short",
      openedAt: Number(row.opened_at),
      entry: Number(row.entry),
      stopLoss: Number(row.stop_loss),
      takeProfit: Number(row.take_profit),
      units: Number(row.units),
      riskAmount: Number(row.risk_amount),
      notional: Number(row.notional),
      marginUsed: Number(row.margin_used),
      confidence: Number(row.confidence),
      reason: String(row.reason)
    };
  }

  async close(): Promise<void> {
    await this.pool?.end();
    this.connected = false;
  }

  private async migrate(): Promise<void> {
    const pool = this.requirePool();
    const statements = [
      `CREATE TABLE IF NOT EXISTS market_candles (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        symbol VARCHAR(32) NOT NULL,
        interval_name VARCHAR(16) NOT NULL,
        source VARCHAR(32) NOT NULL,
        time INT UNSIGNED NOT NULL,
        open DECIMAL(18,5) NOT NULL,
        high DECIMAL(18,5) NOT NULL,
        low DECIMAL(18,5) NOT NULL,
        close DECIMAL(18,5) NOT NULL,
        volume DECIMAL(20,5) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_candle_source (symbol, interval_name, source, time),
        KEY idx_candle_lookup (symbol, interval_name, time)
      )`,
      `CREATE TABLE IF NOT EXISTS demo_trades (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        side VARCHAR(8) NOT NULL,
        opened_at INT UNSIGNED NOT NULL,
        closed_at INT UNSIGNED NOT NULL,
        entry DECIMAL(18,5) NOT NULL,
        stop_loss DECIMAL(18,5) NOT NULL,
        take_profit DECIMAL(18,5) NOT NULL,
        exit_price DECIMAL(18,5) NOT NULL,
        units DECIMAL(20,8) NOT NULL,
        risk_amount DECIMAL(18,5) NOT NULL,
        notional DECIMAL(18,5) NOT NULL,
        margin_used DECIMAL(18,5) NOT NULL,
        confidence INT NOT NULL,
        reason TEXT NOT NULL,
        pnl DECIMAL(18,5) NOT NULL,
        pnl_pct DECIMAL(10,5) NOT NULL,
        outcome VARCHAR(24) NOT NULL,
        duration_candles INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS bot_events (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        time INT UNSIGNED NOT NULL,
        kind VARCHAR(16) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS open_positions (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        side VARCHAR(8) NOT NULL,
        opened_at INT UNSIGNED NOT NULL,
        entry DECIMAL(18,5) NOT NULL,
        stop_loss DECIMAL(18,5) NOT NULL,
        take_profit DECIMAL(18,5) NOT NULL,
        units DECIMAL(20,8) NOT NULL,
        risk_amount DECIMAL(18,5) NOT NULL,
        notional DECIMAL(18,5) NOT NULL,
        margin_used DECIMAL(18,5) NOT NULL,
        confidence INT NOT NULL,
        reason TEXT NOT NULL,
        updated_at INT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS account_snapshots (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        time INT UNSIGNED NOT NULL,
        starting_balance DECIMAL(18,5) NOT NULL,
        balance DECIMAL(18,5) NOT NULL,
        equity DECIMAL(18,5) NOT NULL,
        realized_pnl DECIMAL(18,5) NOT NULL,
        open_pnl DECIMAL(18,5) NOT NULL,
        max_drawdown_pct DECIMAL(10,5) NOT NULL,
        daily_loss_limit_hit BOOLEAN NOT NULL,
        risk_per_trade_pct DECIMAL(10,5) NOT NULL,
        max_leverage DECIMAL(10,5) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const statement of statements) {
      await pool.query(statement);
    }
  }

  private requirePool(): Pool {
    if (!this.pool) throw new Error("MySQL pool hazir degil. initialize() cagrilmali.");
    return this.pool;
  }

  private mapEventKind(kind: unknown): BotEvent["kind"] {
    if (kind === "entry" || kind === "exit" || kind === "risk" || kind === "system") {
      return kind;
    }
    return "system";
  }
}
