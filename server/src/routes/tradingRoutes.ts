import { Router } from "express";
import { createTradingController } from "../controllers/tradingController.js";
import type { TradingService } from "../services/tradingService.js";

interface CreateTradingRoutesOptions {
  tradingService: TradingService;
}

export function createTradingRoutes(options: CreateTradingRoutesOptions) {
  const router = Router();
  const controller = createTradingController(options);

  router.get("/state", controller.getState);
  router.get("/trades", controller.getTrades);
  router.get("/events/trading", controller.getTradingEvents);

  return router;
}
