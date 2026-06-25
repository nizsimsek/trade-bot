import http from "node:http";
import { serverConfig } from "./src/config/env.js";
import { createTradingDatabase } from "./src/database/createTradingDatabase.js";
import { createApp } from "./src/http/createApp.js";
import { createMarketDataProvider } from "./src/market/providers/createMarketDataProvider.js";
import { createStateBroadcaster } from "./src/realtime/stateBroadcaster.js";
import { TradingService } from "./src/services/tradingService.js";

const database = await createTradingDatabase(serverConfig.database);
const marketDataProvider = createMarketDataProvider(serverConfig.marketData);
const tradingService = new TradingService(marketDataProvider, serverConfig.marketData.historyCandles, database);
await tradingService.initialize();

const app = createApp({
  tradingService,
  jsonLimit: serverConfig.jsonLimit
});
const server = http.createServer(app);
const realtime = createStateBroadcaster(server, tradingService);

setInterval(async () => {
  await tradingService.tick();
  realtime.broadcastState();
}, serverConfig.tickMs);

server.listen(serverConfig.port, serverConfig.host, () => {
  console.log(`XAU/USD Demo Trading API running on http://${serverConfig.host}:${serverConfig.port}`);
});
