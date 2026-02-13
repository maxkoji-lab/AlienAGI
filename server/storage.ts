import { db } from "./db";
import {
  metrics, whaleState, buybacks, burns, rewardCampaigns, rewardClaims, tradeSignals,
  type InsertMetric, type InsertWhaleState, type Metric, type WhaleState,
  type InsertBuyback, type Buyback,
  type InsertBurn, type Burn,
  type InsertRewardCampaign, type RewardCampaign,
  type InsertRewardClaim, type RewardClaim,
  type InsertTradeSignal, type TradeSignal,
} from "@shared/schema";
import { eq, desc, lte, and } from "drizzle-orm";

export interface IStorage {
  insertMetric(metric: InsertMetric): Promise<Metric>;
  getLatestMetric(mint: string): Promise<Metric | undefined>;
  getMetricsHistory(mint: string, limit?: number): Promise<Metric[]>;
  getMetricAtOrBefore(mint: string, ts: Date): Promise<Metric | undefined>;
  
  getWhaleLastSig(owner: string): Promise<string | undefined>;
  setWhaleLastSig(owner: string, sig: string): Promise<void>;

  insertBuyback(buyback: InsertBuyback): Promise<Buyback>;
  getBuybacks(limit?: number): Promise<Buyback[]>;
  updateBuybackStatus(id: number, status: string, txSignature?: string): Promise<Buyback | undefined>;

  insertBurn(burn: InsertBurn): Promise<Burn>;
  getBurns(limit?: number): Promise<Burn[]>;
  updateBurnStatus(id: number, status: string, txSignature?: string): Promise<Burn | undefined>;

  insertRewardCampaign(campaign: InsertRewardCampaign): Promise<RewardCampaign>;
  getRewardCampaigns(): Promise<RewardCampaign[]>;
  getRewardCampaign(id: number): Promise<RewardCampaign | undefined>;
  updateRewardCampaignActive(id: number, active: boolean): Promise<RewardCampaign | undefined>;

  insertRewardClaim(claim: InsertRewardClaim): Promise<RewardClaim>;
  getRewardClaims(campaignId: number): Promise<RewardClaim[]>;
  updateRewardClaimStatus(id: number, status: string, txSignature?: string): Promise<RewardClaim | undefined>;

  insertTradeSignal(signal: InsertTradeSignal): Promise<TradeSignal>;
  getTradeSignals(mint?: string, limit?: number): Promise<TradeSignal[]>;
  updateTradeSignalStatus(id: number, status: string, txSignature?: string): Promise<TradeSignal | undefined>;

  getTreasuryStats(): Promise<{
    totalBuybackSol: number;
    totalBuybackTokens: number;
    totalBurned: number;
    totalRewardsDistributed: number;
    activeCampaigns: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async insertMetric(metric: InsertMetric): Promise<Metric> {
    const [inserted] = await db.insert(metrics).values(metric).returning();
    return inserted;
  }

  async getLatestMetric(mint: string): Promise<Metric | undefined> {
    const [latest] = await db
      .select()
      .from(metrics)
      .where(eq(metrics.mint, mint))
      .orderBy(desc(metrics.ts))
      .limit(1);
    return latest;
  }

  async getMetricsHistory(mint: string, limit: number = 100): Promise<Metric[]> {
    return await db
      .select()
      .from(metrics)
      .where(eq(metrics.mint, mint))
      .orderBy(desc(metrics.ts))
      .limit(limit);
  }

  async getMetricAtOrBefore(mint: string, ts: Date): Promise<Metric | undefined> {
    const [found] = await db
      .select()
      .from(metrics)
      .where(lte(metrics.ts, ts))
      .orderBy(desc(metrics.ts))
      .limit(1);
    return found;
  }

  async getWhaleLastSig(owner: string): Promise<string | undefined> {
    const [state] = await db
      .select()
      .from(whaleState)
      .where(eq(whaleState.owner, owner));
    return state?.lastSig ?? undefined;
  }

  async setWhaleLastSig(owner: string, sig: string): Promise<void> {
    await db
      .insert(whaleState)
      .values({ owner, lastSig: sig })
      .onConflictDoUpdate({
        target: whaleState.owner,
        set: { lastSig: sig },
      });
  }

  async insertBuyback(buyback: InsertBuyback): Promise<Buyback> {
    const [inserted] = await db.insert(buybacks).values(buyback).returning();
    return inserted;
  }

  async getBuybacks(limit: number = 50): Promise<Buyback[]> {
    return await db
      .select()
      .from(buybacks)
      .orderBy(desc(buybacks.ts))
      .limit(limit);
  }

  async updateBuybackStatus(id: number, status: string, txSignature?: string): Promise<Buyback | undefined> {
    const updateData: Record<string, any> = { status };
    if (txSignature) updateData.txSignature = txSignature;
    const [updated] = await db
      .update(buybacks)
      .set(updateData)
      .where(eq(buybacks.id, id))
      .returning();
    return updated;
  }

  async insertBurn(burn: InsertBurn): Promise<Burn> {
    const [inserted] = await db.insert(burns).values(burn).returning();
    return inserted;
  }

  async getBurns(limit: number = 50): Promise<Burn[]> {
    return await db
      .select()
      .from(burns)
      .orderBy(desc(burns.ts))
      .limit(limit);
  }

  async updateBurnStatus(id: number, status: string, txSignature?: string): Promise<Burn | undefined> {
    const updateData: Record<string, any> = { status };
    if (txSignature) updateData.txSignature = txSignature;
    const [updated] = await db
      .update(burns)
      .set(updateData)
      .where(eq(burns.id, id))
      .returning();
    return updated;
  }

  async insertRewardCampaign(campaign: InsertRewardCampaign): Promise<RewardCampaign> {
    const [inserted] = await db.insert(rewardCampaigns).values(campaign).returning();
    return inserted;
  }

  async getRewardCampaigns(): Promise<RewardCampaign[]> {
    return await db
      .select()
      .from(rewardCampaigns)
      .orderBy(desc(rewardCampaigns.ts));
  }

  async getRewardCampaign(id: number): Promise<RewardCampaign | undefined> {
    const [found] = await db
      .select()
      .from(rewardCampaigns)
      .where(eq(rewardCampaigns.id, id));
    return found;
  }

  async updateRewardCampaignActive(id: number, active: boolean): Promise<RewardCampaign | undefined> {
    const [updated] = await db
      .update(rewardCampaigns)
      .set({ active })
      .where(eq(rewardCampaigns.id, id))
      .returning();
    return updated;
  }

  async insertRewardClaim(claim: InsertRewardClaim): Promise<RewardClaim> {
    const [inserted] = await db.insert(rewardClaims).values(claim).returning();
    const campaign = await this.getRewardCampaign(claim.campaignId);
    if (campaign) {
      await db
        .update(rewardCampaigns)
        .set({ claimedCount: campaign.claimedCount + 1 })
        .where(eq(rewardCampaigns.id, claim.campaignId));
    }
    return inserted;
  }

  async getRewardClaims(campaignId: number): Promise<RewardClaim[]> {
    return await db
      .select()
      .from(rewardClaims)
      .where(eq(rewardClaims.campaignId, campaignId))
      .orderBy(desc(rewardClaims.ts));
  }

  async updateRewardClaimStatus(id: number, status: string, txSignature?: string): Promise<RewardClaim | undefined> {
    const updateData: Record<string, any> = { status };
    if (txSignature) updateData.txSignature = txSignature;
    const [updated] = await db
      .update(rewardClaims)
      .set(updateData)
      .where(eq(rewardClaims.id, id))
      .returning();
    return updated;
  }

  async insertTradeSignal(signal: InsertTradeSignal): Promise<TradeSignal> {
    const [inserted] = await db.insert(tradeSignals).values(signal).returning();
    return inserted;
  }

  async getTradeSignals(mint?: string, limit: number = 50): Promise<TradeSignal[]> {
    if (mint) {
      return await db
        .select()
        .from(tradeSignals)
        .where(eq(tradeSignals.mint, mint))
        .orderBy(desc(tradeSignals.ts))
        .limit(limit);
    }
    return await db
      .select()
      .from(tradeSignals)
      .orderBy(desc(tradeSignals.ts))
      .limit(limit);
  }

  async updateTradeSignalStatus(id: number, status: string, txSignature?: string): Promise<TradeSignal | undefined> {
    const updateData: Record<string, any> = { status };
    if (txSignature) updateData.txSignature = txSignature;
    const [updated] = await db
      .update(tradeSignals)
      .set(updateData)
      .where(eq(tradeSignals.id, id))
      .returning();
    return updated;
  }

  async getTreasuryStats(): Promise<{
    totalBuybackSol: number;
    totalBuybackTokens: number;
    totalBurned: number;
    totalRewardsDistributed: number;
    activeCampaigns: number;
  }> {
    const allBuybacks = await db.select().from(buybacks).where(eq(buybacks.status, "executed"));
    const allBurns = await db.select().from(burns).where(eq(burns.status, "executed"));
    const allClaims = await db.select().from(rewardClaims).where(eq(rewardClaims.status, "distributed"));
    const activeCamps = await db.select().from(rewardCampaigns).where(eq(rewardCampaigns.active, true));

    return {
      totalBuybackSol: allBuybacks.reduce((sum, b) => sum + b.amountSol, 0),
      totalBuybackTokens: allBuybacks.reduce((sum, b) => sum + b.amountTokens, 0),
      totalBurned: allBurns.reduce((sum, b) => sum + b.amountTokens, 0),
      totalRewardsDistributed: allClaims.reduce((sum, c) => sum + c.rewardUsd, 0),
      activeCampaigns: activeCamps.length,
    };
  }
}

export const storage = new DatabaseStorage();
