import { AlertTriangle, CircleDollarSign, Gauge, Wallet } from "lucide-react";
import type { AccountState } from "../types/trading";
import { Metric } from "./Metric";

interface AccountMetricsProps {
  account: AccountState;
}

export function AccountMetrics({ account }: AccountMetricsProps) {
  const pnl = account.realizedPnl + account.openPnl;
  const pnlPositive = pnl >= 0;

  return (
    <section className="metrics-grid">
      <Metric icon={<Wallet />} label="Equity" value={`$${account.equity.toFixed(2)}`} detail={`Bakiye $${account.balance.toFixed(2)}`} />
      <Metric
        icon={<CircleDollarSign />}
        label="PnL"
        value={`${pnlPositive ? "+" : ""}$${pnl.toFixed(2)}`}
        detail={`Realized ${account.realizedPnl >= 0 ? "+" : ""}$${account.realizedPnl.toFixed(2)}`}
        tone={pnlPositive ? "good" : "bad"}
      />
      <Metric icon={<Gauge />} label="Risk" value={`%${account.riskPerTradePct}`} detail={`Maks. ${account.maxLeverage}x kaldıraç`} />
      <Metric
        icon={<AlertTriangle />}
        label="Drawdown"
        value={`%${account.maxDrawdownPct.toFixed(2)}`}
        detail={account.dailyLossLimitHit ? "Günlük limit aktif" : "Limit normal"}
        tone={account.dailyLossLimitHit ? "bad" : "neutral"}
      />
    </section>
  );
}
