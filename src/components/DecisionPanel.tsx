import { LineChart } from "lucide-react";
import type { DashboardState } from "../types/trading";
import { formatMaybe, translateTrend } from "../utils/format";

interface DecisionPanelProps {
  state: DashboardState;
}

export function DecisionPanel({ state }: DecisionPanelProps) {
  const indicators = state.indicators;

  return (
    <section className="decision-overlay">
      <div className="decision-main-row">
        <div className="decision-summary">
          <div className="decision-title">
            <LineChart size={18} />
            <h2>Karar Motoru</h2>
          </div>
          <h3>{state.signal.title}</h3>
          <p>{state.signal.summary}</p>
        </div>
        <div className="indicator-list">
          <span>Trend <b>{translateTrend(indicators.trend)}</b></span>
          <span>RSI <b>{formatMaybe(indicators.rsi14)}</b></span>
          <span>ATR <b>{formatMaybe(indicators.atr14, "$")}</b></span>
          <span>Destek <b>{formatMaybe(indicators.support, "$")}</b></span>
          <span>Direnç <b>{formatMaybe(indicators.resistance, "$")}</b></span>
        </div>
      </div>
      <div className="checklist">
        {state.signal.checklist.map((item) => (
          <div className="check" key={item.label}>
            <span className={item.passed ? "pass" : "fail"}>{item.passed ? "✓" : "×"}</span>
            <div>
              <strong>{item.label}</strong>
              <small>{item.value}</small>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
