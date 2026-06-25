import { BarChart3, Percent, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import type { PerformanceStats } from "../types/trading";

interface PerformancePanelProps {
  performance: PerformanceStats;
}

export function PerformancePanel({ performance }: PerformancePanelProps) {
  const profitFactor = performance.profitFactor === null ? "∞" : performance.profitFactor.toFixed(2);

  return (
    <section className="performance-panel">
      <div className="performance-title">
        <BarChart3 size={18} />
        <h2>Performans Özeti</h2>
      </div>
      <div className="performance-grid">
        <Stat label="İşlem" value={String(performance.totalTrades)} detail={`${performance.winningTrades} TP / ${performance.losingTrades} SL`} />
        <Stat icon={<Percent size={16} />} label="Winrate" value={`%${performance.winRate.toFixed(1)}`} detail="Tüm kapanan işlemler" />
        <Stat label="Profit factor" value={profitFactor} detail={`Gross +$${performance.grossProfit.toFixed(2)} / -$${performance.grossLoss.toFixed(2)}`} />
        <Stat
          icon={<TrendingUp size={16} />}
          label="Expectancy"
          value={`${performance.expectancy >= 0 ? "+" : ""}$${performance.expectancy.toFixed(2)}`}
          detail="İşlem başı beklenen PnL"
          tone={performance.expectancy >= 0 ? "good" : "bad"}
        />
        <Stat label="Ort. kazanç" value={`$${performance.avgWin.toFixed(2)}`} detail="Kazanan işlem ort." tone="good" />
        <Stat label="Ort. kayıp" value={`$${performance.avgLoss.toFixed(2)}`} detail="Kaybeden işlem ort." tone="bad" />
        <Stat
          label="Net PnL"
          value={`${performance.netPnl >= 0 ? "+" : ""}$${performance.netPnl.toFixed(2)}`}
          detail="Kapanan işlemler"
          tone={performance.netPnl >= 0 ? "good" : "bad"}
        />
        <Stat label="Max DD" value={`%${performance.maxDrawdownPct.toFixed(2)}`} detail="Hesap equity zirvesinden" />
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  detail,
  tone = "neutral"
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <div className={`performance-stat ${tone}`}>
      <span>{icon}{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
