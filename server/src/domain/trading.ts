export type Side = "long" | "short";
export type SignalAction = "buy" | "sell" | "hold";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorSnapshot {
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  atr14: number | null;
  support: number | null;
  supportTime: number | null;
  resistance: number | null;
  resistanceTime: number | null;
  trend: "bullish" | "bearish" | "sideways" | "warming-up";
  volatility: "low" | "normal" | "high" | "warming-up";
}

export interface StrategySignal {
  action: SignalAction;
  confidence: number;
  title: string;
  summary: string;
  checklist: Array<{
    label: string;
    passed: boolean;
    value: string;
  }>;
  proposedTrade?: {
    side: Side;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    riskReward: number;
  };
}

export interface Position {
  id: string;
  side: Side;
  openedAt: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  units: number;
  riskAmount: number;
  notional: number;
  marginUsed: number;
  confidence: number;
  reason: string;
}

export interface Trade extends Position {
  closedAt: number;
  exit: number;
  pnl: number;
  pnlPct: number;
  outcome: "take-profit" | "stop-loss";
  durationCandles: number;
}

export interface AccountState {
  startingBalance: number;
  balance: number;
  equity: number;
  realizedPnl: number;
  openPnl: number;
  maxDrawdownPct: number;
  dailyLossLimitHit: boolean;
  riskPerTradePct: number;
  maxLeverage: number;
}

export interface PerformanceStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number | null;
  expectancy: number;
  maxDrawdownPct: number;
}

export interface MarketDataStatus {
  provider: "twelvedata";
  symbol: string;
  interval: string;
  isLive: boolean;
  source: string;
  transport: "websocket";
  lastPrice: number | null;
  lastTickAt: number | null;
  message: string;
}

export interface DatabaseStatus {
  connected: boolean;
  dialect: "mysql";
  database?: string;
  host?: string;
  message: string;
}

export interface DashboardState {
  marketData: MarketDataStatus;
  database: DatabaseStatus;
  candles: Candle[];
  indicators: IndicatorSnapshot;
  signal: StrategySignal;
  account: AccountState;
  performance: PerformanceStats;
  openPosition: Position | null;
  trades: Trade[];
  events: BotEvent[];
}

export interface BotEvent {
  id: string;
  time: number;
  kind: "entry" | "exit" | "risk" | "system";
  title: string;
  message: string;
}
