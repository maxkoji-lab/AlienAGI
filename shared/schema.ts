import { pgTable, text, serial, integer, real, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const metrics = pgTable("metrics", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts").defaultNow(),
  mint: text("mint").notNull(),
  holders: integer("holders").notNull(),
  whaleNetFlow: real("whale_net_flow").notNull(),
  nciRaw: real("nci_raw").notNull(),
  nciEma: real("nci_ema").notNull(),
  band: text("band").notNull(),
  posture: text("posture").notNull(),
});

export const whaleState = pgTable("whale_state", {
  owner: text("owner").primaryKey(),
  lastSig: text("last_sig"),
});

export const buybacks = pgTable("buybacks", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts").defaultNow(),
  amountSol: real("amount_sol").notNull(),
  amountTokens: real("amount_tokens").notNull(),
  txSignature: text("tx_signature"),
  status: text("status").notNull().default("proposed"),
});

export const burns = pgTable("burns", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts").defaultNow(),
  amountTokens: real("amount_tokens").notNull(),
  txSignature: text("tx_signature"),
  source: text("source").notNull().default("buyback"),
  status: text("status").notNull().default("proposed"),
});

export const rewardCampaigns = pgTable("reward_campaigns", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts").defaultNow(),
  name: text("name").notNull(),
  minHoldingUsd: real("min_holding_usd").notNull().default(10),
  rewardUsd: real("reward_usd").notNull().default(0.2),
  totalBudgetUsd: real("total_budget_usd").notNull(),
  claimedCount: integer("claimed_count").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const rewardClaims = pgTable("reward_claims", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts").defaultNow(),
  campaignId: integer("campaign_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  holdingUsd: real("holding_usd").notNull(),
  rewardUsd: real("reward_usd").notNull(),
  txSignature: text("tx_signature"),
  status: text("status").notNull().default("pending"),
});

export const tradeSignals = pgTable("trade_signals", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts").defaultNow(),
  mint: text("mint").notNull(),
  tokenSymbol: text("token_symbol"),
  action: text("action").notNull(),
  nciAtSignal: real("nci_at_signal").notNull(),
  band: text("band").notNull(),
  amountSol: real("amount_sol"),
  walletAddress: text("wallet_address"),
  txSignature: text("tx_signature"),
  status: text("status").notNull().default("pending"),
  priceAtTrade: real("price_at_trade"),
  tokenAmount: real("token_amount"),
});

export const insertMetricSchema = createInsertSchema(metrics).omit({ id: true, ts: true });
export const insertWhaleStateSchema = createInsertSchema(whaleState);
export const insertBuybackSchema = createInsertSchema(buybacks).omit({ id: true, ts: true });
export const insertBurnSchema = createInsertSchema(burns).omit({ id: true, ts: true });
export const insertRewardCampaignSchema = createInsertSchema(rewardCampaigns).omit({ id: true, ts: true, claimedCount: true });
export const insertRewardClaimSchema = createInsertSchema(rewardClaims).omit({ id: true, ts: true });

export type Metric = typeof metrics.$inferSelect;
export type InsertMetric = z.infer<typeof insertMetricSchema>;
export type WhaleState = typeof whaleState.$inferSelect;
export type InsertWhaleState = z.infer<typeof insertWhaleStateSchema>;
export type Buyback = typeof buybacks.$inferSelect;
export type InsertBuyback = z.infer<typeof insertBuybackSchema>;
export type Burn = typeof burns.$inferSelect;
export type InsertBurn = z.infer<typeof insertBurnSchema>;
export type RewardCampaign = typeof rewardCampaigns.$inferSelect;
export type InsertRewardCampaign = z.infer<typeof insertRewardCampaignSchema>;
export type RewardClaim = typeof rewardClaims.$inferSelect;
export type InsertRewardClaim = z.infer<typeof insertRewardClaimSchema>;

export const insertTradeSignalSchema = createInsertSchema(tradeSignals).omit({ id: true, ts: true });
export type TradeSignal = typeof tradeSignals.$inferSelect;
export type InsertTradeSignal = z.infer<typeof insertTradeSignalSchema>;
