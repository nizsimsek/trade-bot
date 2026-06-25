import type { ConnectionStatus, DatabaseStatus, MarketDataStatus } from "../types/trading";
import { formatIstanbulTime } from "../utils/format";
import { NotificationControl } from "./NotificationControl";
import { NotificationTestButton } from "./NotificationTestButton";

interface HeaderProps {
  connection: ConnectionStatus;
  marketData: MarketDataStatus;
  database: DatabaseStatus;
}

export function Header({ connection, marketData, database }: HeaderProps) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">XAU/USD Demo Trading</p>
        <h1>Altın/Dolar Bot Dashboard</h1>
        <p className="data-source">
          Veri: Twelve Data · {marketData.symbol} · {marketData.interval}
          <span className="db-status connected">
            WS: {marketData.lastPrice === null ? "bekleniyor" : `$${marketData.lastPrice.toFixed(2)}`} · {formatIstanbulTime(marketData.lastTickAt)}
          </span>
          <span className={database.connected ? "db-status connected" : "db-status"}>
            DB: {database.connected ? `${database.dialect}/${database.database}` : "bağlantı yok"}
          </span>
        </p>
      </div>
      <div className="topbar-actions">
        <NotificationControl />
        <NotificationTestButton />
        <div className={`connection ${connection}`}>
          <span />
          {connection === "live" ? "Canlı demo takip" : connection === "connecting" ? "Bağlanıyor" : "Offline"}
        </div>
      </div>
    </header>
  );
}
