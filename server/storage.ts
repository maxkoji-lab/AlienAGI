import { db } from "./db";
import { metrics, whaleState, type InsertMetric, type InsertWhaleState, type Metric, type WhaleState } from "@shared/schema";
import { eq, desc, lte } from "drizzle-orm";

export interface IStorage {
  insertMetric(metric: InsertMetric): Promise<Metric>;
  getLatestMetric(mint: string): Promise<Metric | undefined>;
  getMetricsHistory(mint: string, limit?: number): Promise<Metric[]>;
  getMetricAtOrBefore(mint: string, ts: Date): Promise<Metric | undefined>;
  
  getWhaleLastSig(owner: string): Promise<string | undefined>;
  setWhaleLastSig(owner: string, sig: string): Promise<void>;
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
}

export const storage = new DatabaseStorage();
