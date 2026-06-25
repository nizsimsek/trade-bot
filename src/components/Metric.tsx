import type { ReactNode } from "react";

interface MetricProps {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "good" | "bad";
}

export function Metric({ icon, label, value, detail, tone = "neutral" }: MetricProps) {
  return (
    <div className={`metric ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}
