import React from "react";
import { toast } from "sonner";
import type { BotEvent } from "../types/trading";

interface LiveToastsProps {
  events: BotEvent[];
}

export function LiveToasts({ events }: LiveToastsProps) {
  const seenIdsRef = React.useRef<Set<string>>(new Set());
  const initializedRef = React.useRef(false);

  React.useEffect(() => {
    if (!initializedRef.current) {
      seenIdsRef.current = new Set(events.map((event) => event.id));
      initializedRef.current = true;
      return;
    }

    const incoming = events
      .filter((event) => !seenIdsRef.current.has(event.id))
      .reverse();

    if (!incoming.length) return;

    incoming.forEach((event) => seenIdsRef.current.add(event.id));
    incoming.forEach((event) => {
      notifyTradeEvent(event);
    });
  }, [events]);

  return null;
}

export function notifyTradeEvent(event: BotEvent) {
  const options = {
    id: event.id,
    description: event.message,
    duration: 5200
  };

  if (event.kind === "entry") {
    toast.success(event.title, options);
  } else if (event.kind === "exit") {
    toast.info(event.title, options);
  } else if (event.kind === "risk") {
    toast.warning(event.title, options);
  } else {
    toast(event.title, options);
  }

  notifyBrowser(event);
  notifyNativeApp(event);
}

function notifyBrowser(event: BotEvent) {
  if (!("Notification" in window) || !window.isSecureContext || Notification.permission !== "granted") return;

  try {
    const notification = new Notification(`XAU/USD Bot · ${event.title}`, {
      body: event.message,
      tag: event.id
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    window.setTimeout(() => notification.close(), 7000);
  } catch {
    // Browser notification support differs across mobile/desktop browsers.
  }
}

function notifyNativeApp(event: BotEvent) {
  const webkit = (window as Window & {
    webkit?: {
      messageHandlers?: {
        tradingNotification?: {
          postMessage: (payload: { id: string; title: string; body: string; kind: BotEvent["kind"] }) => void;
        };
      };
    };
  }).webkit;

  webkit?.messageHandlers?.tradingNotification?.postMessage({
    id: event.id,
    title: event.title,
    body: event.message,
    kind: event.kind
  });
}
