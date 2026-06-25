import type { DatabaseConfig } from "../config/env.js";
import { MySqlTradingDatabase } from "./mysqlTradingDatabase.js";
import type { TradingDatabase } from "./tradingDatabase.js";

export async function createTradingDatabase(config: DatabaseConfig): Promise<TradingDatabase> {
  const database = new MySqlTradingDatabase(config);
  await database.initialize();
  return database;
}
