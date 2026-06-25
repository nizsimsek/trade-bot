import React from "react";
import type { ConnectionStatus, DashboardState } from "../types/trading";

export function useDashboardSocket() {
  const [state, setState] = React.useState<DashboardState | null>(null);
  const [connection, setConnection] = React.useState<ConnectionStatus>("connecting");

  React.useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    function connect() {
      if (disposed) return;

      socket = new WebSocket(getWebSocketUrl());
      socket.onopen = () => setConnection("live");
      socket.onerror = () => setConnection("offline");
      socket.onmessage = (message) => {
        const data = JSON.parse(message.data);
        if (data.type === "state") setState(data.payload);
      };
      socket.onclose = () => {
        if (disposed) return;
        setConnection("offline");
        reconnectTimer = window.setTimeout(connect, 1500);
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (!socket) return;

      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;

      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      } else if (socket.readyState === WebSocket.CONNECTING) {
        socket.onopen = () => socket?.close();
      }
    };
  }, []);

  return { state, connection };
}

function getWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}/ws`;
}
