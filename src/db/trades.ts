import { query } from "./db";

export async function saveTrade(trade: {
  bot: string;
  type: string;
  pair: string;
  price: number;
  volume: number;
  usd_value: number;
  order_id?: string;
  mcs?: number;
}) {
  await query(
    `INSERT INTO trades (bot, type, pair, price, volume, usd_value, order_id, mcs)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      trade.bot,
      trade.type,
      trade.pair,
      trade.price,
      trade.volume,
      trade.usd_value,
      trade.order_id || null,
      trade.mcs || null
    ]
  );
}