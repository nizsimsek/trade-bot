import type http from "node:http";
import { WebSocketServer } from "ws";
import type { DashboardState } from "../domain/trading.js";
import type { TradingService } from "../services/tradingService.js";

type StateMessage = {
  type: "state";
  payload: DashboardState;
};

export function createStateBroadcaster(server: http.Server, tradingService: TradingService) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "state", payload: tradingService.getDashboardState() } satisfies StateMessage));
  });

  function broadcastState(): void {
    const json = JSON.stringify({ type: "state", payload: tradingService.getDashboardState() } satisfies StateMessage);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(json);
    }
  }

  return { broadcastState };
}
