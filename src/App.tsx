import { Toaster } from "sonner";
import { AccountMetrics } from "./components/AccountMetrics";
import { ChartPanel } from "./components/ChartPanel";
import { DecisionPanel } from "./components/DecisionPanel";
import { EventLog } from "./components/EventLog";
import { Header } from "./components/Header";
import { LiveToasts } from "./components/LiveToasts";
import { LoadingScreen } from "./components/LoadingScreen";
import { PerformancePanel } from "./components/PerformancePanel";
import { TradesTable } from "./components/TradesTable";
import { useDashboardSocket } from "./hooks/useDashboardSocket";
import { usePaginatedHistory } from "./hooks/usePaginatedHistory";
import type { BotEvent, ConnectionStatus, DashboardState, Trade } from "./types/trading";

export function App() {
  const { state, connection } = useDashboardSocket();

  if (!state) return <LoadingScreen />;

  return <Dashboard state={state} connection={connection} />;
}

function Dashboard({ state, connection }: { state: DashboardState; connection: ConnectionStatus }) {
  const newestTradeId = state?.trades[0]?.id;
  const newestTradingEventId = state?.events[0]?.id;
  const tradeHistory = usePaginatedHistory<Trade>("/api/trades", newestTradeId);
  const tradingEventHistory = usePaginatedHistory<BotEvent>("/api/events/trading", newestTradingEventId);

  return (
    <main className="shell">
      <Header connection={connection} marketData={state.marketData} database={state.database} />
      <AccountMetrics account={state.account} />
      <PerformancePanel performance={state.performance} />

      <section className="chart-workspace">
        <DecisionPanel state={state} />
        <ChartPanel state={state} />
      </section>

      <section className="bottom-grid">
        <TradesTable
          trades={tradeHistory.items}
          openPosition={state.openPosition}
          currentPrice={state.candles.at(-1)?.close}
          hasMore={tradeHistory.hasMore}
          isLoading={tradeHistory.isLoading}
          onLoadMore={tradeHistory.loadMore}
        />
        <EventLog
          title="İşlem Günlüğü"
          events={tradingEventHistory.items}
          hasMore={tradingEventHistory.hasMore}
          isLoading={tradingEventHistory.isLoading}
          onLoadMore={tradingEventHistory.loadMore}
          emptyText="Henüz işlem kaydı yok."
        />
      </section>

      <LiveToasts events={state.events} />
      <Toaster
        theme="dark"
        richColors
        closeButton
        position="top-right"
        visibleToasts={4}
        toastOptions={{ duration: 5200 }}
      />
    </main>
  );
}
