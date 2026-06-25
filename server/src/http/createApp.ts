import cors from "cors";
import express from "express";
import { createTradingRoutes } from "../routes/tradingRoutes.js";
import type { TradingService } from "../services/tradingService.js";

interface CreateAppOptions {
  tradingService: TradingService;
  jsonLimit: string;
}

export function createApp({ tradingService, jsonLimit }: CreateAppOptions) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: jsonLimit }));
  app.use("/api", createTradingRoutes({ tradingService }));

  return app;
}
