import { Activity, ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { DashboardState } from "../types/trading";
import { formatIstanbulTime } from "../utils/format";
import { TradingChart } from "./TradingChart";

interface ChartPanelProps {
  state: DashboardState;
}

export function ChartPanel({ state }: ChartPanelProps) {
  return (
    <div className="chart-panel">
      <div className="panel-heading">
        <div>
          <h2>XAU/USD 1m</h2>
          <p>
            Twelve Data WS · Son tick {formatIstanbulTime(state.marketData.lastTickAt)} ·
            Son fiyat {state.marketData.lastPrice === null ? "-" : `$${state.marketData.lastPrice.toFixed(2)}`}
          </p>
        </div>
        <div className={`signal-pill ${state.signal.action}`}>
          {state.signal.action === "buy" ? <ArrowUpRight size={16} /> : state.signal.action === "sell" ? <ArrowDownRight size={16} /> : <Activity size={16} />}
          {state.signal.action.toUpperCase()} · %{state.signal.confidence}
        </div>
      </div>
      <TradingChart state={state} />
    </div>
  );
}
