import { Activity } from "lucide-react";

export function LoadingScreen() {
  return (
    <main className="shell loading-shell">
      <div className="loading-panel">
        <Activity size={24} />
        <span>Dashboard bağlanıyor</span>
      </div>
    </main>
  );
}
