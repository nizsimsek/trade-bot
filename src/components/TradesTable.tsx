import type React from "react";
import type { Position, Trade } from "../types/trading";

interface TradesTableProps {
  trades: Trade[];
  openPosition?: Position | null;
  currentPrice?: number;
  title?: string;
  hasMore?: boolean;
  isLoading?: boolean;
  onLoadMore?: () => void;
}

export function TradesTable({
  trades,
  openPosition = null,
  currentPrice,
  title = "İşlem Geçmişi",
  hasMore = false,
  isLoading = false,
  onLoadMore
}: TradesTableProps) {
  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom < 48 && hasMore && !isLoading) onLoadMore?.();
  }

  const content = (
    <>
      <h2>{title}</h2>
      <div className="table-scroll" onScroll={handleScroll}>
        <div className="table">
          <div className="table-row head">
            <span>Durum</span>
            <span>Yön</span>
            <span>Başlangıç</span>
            <span>Bitiş</span>
            <span>Süre</span>
            <span>Entry</span>
            <span>SL / TP</span>
            <span>Exit Hedefi</span>
            <span>PnL</span>
          </div>
          {openPosition ? <OpenPositionRow position={openPosition} currentPrice={currentPrice} /> : null}
          {!openPosition && trades.length === 0 ? <p className="muted table-empty">Açık veya kapanan işlem yok.</p> : null}
          {trades.map((trade) => (
            <div className="table-row" key={trade.id}>
              <span>{trade.outcome === "take-profit" ? "TP" : "SL"}</span>
              <span className={`side-text ${trade.side}`}>{trade.side.toUpperCase()}</span>
              <span>{formatTime(trade.openedAt)}</span>
              <span>{formatTime(trade.closedAt)}</span>
              <span>{formatDuration(trade.closedAt - trade.openedAt)}</span>
              <span>${trade.entry.toFixed(2)}</span>
              <span>${trade.stopLoss.toFixed(2)} / ${trade.takeProfit.toFixed(2)}</span>
              <span>${trade.exit.toFixed(2)}</span>
              <span className={trade.pnl >= 0 ? "positive" : "negative"}>{trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}</span>
            </div>
          ))}
          {isLoading ? <div className="history-loader">Yükleniyor...</div> : null}
          {!isLoading && hasMore ? <button className="history-more" type="button" onClick={onLoadMore}>5 kayıt daha getir</button> : null}
        </div>
      </div>
    </>
  );

  return <section className="panel table-panel">{content}</section>;
}

function OpenPositionRow({ position, currentPrice }: { position: Position; currentPrice?: number }) {
  const pnl = currentPrice === undefined ? 0 : (currentPrice - position.entry) * position.units * (position.side === "long" ? 1 : -1);
  const elapsedSeconds = Math.max(0, Math.floor(Date.now() / 1000) - position.openedAt);

  return (
    <div className="table-row open-trade">
      <span>AÇIK</span>
      <span className={`side-text ${position.side}`}>{position.side.toUpperCase()}</span>
      <span>{formatTime(position.openedAt)}</span>
      <span>-</span>
      <span>{formatDuration(elapsedSeconds)}</span>
      <span>${position.entry.toFixed(2)}</span>
      <span>${position.stopLoss.toFixed(2)} / ${position.takeProfit.toFixed(2)}</span>
      <span>TP ${position.takeProfit.toFixed(2)} / SL ${position.stopLoss.toFixed(2)}</span>
      <span className={pnl >= 0 ? "positive" : "negative"}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</span>
    </div>
  );
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp * 1000));
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.floor(seconds / 60));
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} sa` : `${hours} sa ${rest} dk`;
}
