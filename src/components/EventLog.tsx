import type React from "react";
import type { BotEvent } from "../types/trading";

interface EventLogProps {
  title: string;
  events: BotEvent[];
  hasMore?: boolean;
  isLoading?: boolean;
  onLoadMore?: () => void;
  emptyText?: string;
}

export function EventLog({ title, events, hasMore = false, isLoading = false, onLoadMore, emptyText = "Kayıt yok." }: EventLogProps) {
  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom < 48 && hasMore && !isLoading) onLoadMore?.();
  }

  return (
    <section className="panel event-panel">
      <h2>{title}</h2>
      <div className="events-scroll" onScroll={handleScroll}>
        <div className="events">
          {!isLoading && events.length === 0 ? <p className="muted table-empty">{emptyText}</p> : null}
          {events.map((event) => (
            <article className={`event ${event.kind}`} key={event.id}>
              <time>{new Date(event.time * 1000).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time>
              <div>
                <strong>{event.title}</strong>
                <p>{event.message}</p>
              </div>
            </article>
          ))}
          {isLoading ? <div className="history-loader">Yükleniyor...</div> : null}
          {!isLoading && hasMore ? <button className="history-more" type="button" onClick={onLoadMore}>5 kayıt daha getir</button> : null}
        </div>
      </div>
    </section>
  );
}
