import type { Request, Response } from "express";
import type { TradingService } from "../services/tradingService.js";

interface TradingControllerOptions {
  tradingService: TradingService;
}

export function createTradingController({ tradingService }: TradingControllerOptions) {
  return {
    getState(_request: Request, response: Response) {
      response.json(tradingService.getDashboardState());
    },

    async getTrades(request: Request, response: Response) {
      response.json(await tradingService.getTradesPage(readNumber(request.query.limit), readNumber(request.query.offset)));
    },

    async getTradingEvents(request: Request, response: Response) {
      response.json(await tradingService.getTradingEventsPage(readNumber(request.query.limit), readNumber(request.query.offset)));
    }
  };
}

function readNumber(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
