import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { runOperatorLoop, buildBrief, bandAndPosture, getHoldersSnapshot, computeNciRaw } from "./services/operator";
import { insertBuybackSchema, insertBurnSchema, insertRewardCampaignSchema, insertRewardClaimSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  runOperatorLoop().catch(console.error);

  app.get(api.metrics.list.path, async (req, res) => {
    const mint = process.env.NOOP_MINT;
    if (!mint) return res.json([]);
    const metrics = await storage.getMetricsHistory(mint);
    res.json(metrics);
  });

  app.get(api.metrics.latest.path, async (req, res) => {
    const mint = process.env.NOOP_MINT;
    if (!mint) return res.json(null);
    const metric = await storage.getLatestMetric(mint);
    res.json(metric || null);
  });

  app.get(api.brief.latest.path, async (req, res) => {
    const mint = process.env.NOOP_MINT || "";
    if (!mint) return res.status(500).json({ brief: "NOOP_MINT not configured", generatedAt: new Date().toISOString() });

    const metric = await storage.getLatestMetric(mint);
    if (!metric) {
      return res.json({ brief: "No data yet. Operator initializing...", generatedAt: new Date().toISOString() });
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const metric24h = await storage.getMetricAtOrBefore(mint, oneDayAgo);
    const holdersDelta = metric24h ? metric.holders - metric24h.holders : 0;

    const { band, posture } = bandAndPosture(metric.nciEma);
    
    const brief = buildBrief(
      mint,
      metric.holders,
      holdersDelta,
      metric.whaleNetFlow,
      metric.nciEma,
      band,
      posture,
      parseInt(process.env.NOOP_WHALE_TOP_N || "20"),
      parseFloat(process.env.NOOP_WHALE_WINDOW_HOURS || "6")
    );

    res.json({
      brief,
      generatedAt: metric.ts ? new Date(metric.ts).toISOString() : new Date().toISOString()
    });
  });

  app.get(api.treasury.stats.path, async (_req, res) => {
    const stats = await storage.getTreasuryStats();
    res.json(stats);
  });

  app.get(api.treasury.buybacks.list.path, async (_req, res) => {
    const list = await storage.getBuybacks();
    res.json(list);
  });

  app.post(api.treasury.buybacks.create.path, async (req, res) => {
    const parsed = insertBuybackSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const buyback = await storage.insertBuyback(parsed.data);
    res.status(201).json(buyback);
  });

  app.patch("/api/treasury/buybacks/:id/status", async (req, res) => {
    const id = parseInt(req.params.id);
    const { status, txSignature } = req.body;
    if (!status) return res.status(400).json({ message: "status required" });
    const updated = await storage.updateBuybackStatus(id, status, txSignature);
    if (!updated) return res.status(404).json({ message: "Buyback not found" });
    res.json(updated);
  });

  app.get(api.treasury.burns.list.path, async (_req, res) => {
    const list = await storage.getBurns();
    res.json(list);
  });

  app.post(api.treasury.burns.create.path, async (req, res) => {
    const parsed = insertBurnSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const burn = await storage.insertBurn(parsed.data);
    res.status(201).json(burn);
  });

  app.patch("/api/treasury/burns/:id/status", async (req, res) => {
    const id = parseInt(req.params.id);
    const { status, txSignature } = req.body;
    if (!status) return res.status(400).json({ message: "status required" });
    const updated = await storage.updateBurnStatus(id, status, txSignature);
    if (!updated) return res.status(404).json({ message: "Burn not found" });
    res.json(updated);
  });

  app.get(api.treasury.campaigns.list.path, async (_req, res) => {
    const list = await storage.getRewardCampaigns();
    res.json(list);
  });

  app.post(api.treasury.campaigns.create.path, async (req, res) => {
    const parsed = insertRewardCampaignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const campaign = await storage.insertRewardCampaign(parsed.data);
    res.status(201).json(campaign);
  });

  app.patch("/api/treasury/campaigns/:id/toggle", async (req, res) => {
    const id = parseInt(req.params.id);
    const { active } = req.body;
    if (active === undefined) return res.status(400).json({ message: "active required" });
    const updated = await storage.updateRewardCampaignActive(id, active);
    if (!updated) return res.status(404).json({ message: "Campaign not found" });
    res.json(updated);
  });

  app.get("/api/treasury/campaigns/:id/claims", async (req, res) => {
    const id = parseInt(req.params.id);
    const claims = await storage.getRewardClaims(id);
    res.json(claims);
  });

  app.post("/api/treasury/campaigns/:id/claims", async (req, res) => {
    const id = parseInt(req.params.id);
    const campaign = await storage.getRewardCampaign(id);
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });
    if (!campaign.active) return res.status(400).json({ message: "Campaign is not active" });

    const parsed = insertRewardClaimSchema.safeParse({ ...req.body, campaignId: id });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    if (parsed.data.holdingUsd < campaign.minHoldingUsd) {
      return res.status(400).json({ message: `Minimum holding of $${campaign.minHoldingUsd} required` });
    }

    const claim = await storage.insertRewardClaim({ ...parsed.data, rewardUsd: campaign.rewardUsd });
    res.status(201).json(claim);
  });

  app.post(api.analyze.path, async (req, res) => {
    const schema = z.object({ mint: z.string().min(30).max(50) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid contract address" });

    const { mint } = parsed.data;

    if (!process.env.HELIUS_API_KEY) {
      return res.status(503).json({ message: "Helius API key not configured. Token analysis unavailable." });
    }

    try {
      const { holders, ownerBal } = await getHoldersSnapshot(mint);
      const topWhales = Object.entries(ownerBal)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20);

      const totalSupplyHeld = Object.values(ownerBal).reduce((a, b) => a + b, 0);
      const whaleConcentration = topWhales.reduce((a, [, b]) => a + b, 0);
      const concentrationPct = totalSupplyHeld > 0 ? (whaleConcentration / totalSupplyHeld) * 100 : 0;

      const nciRaw = computeNciRaw({ holders, holdersDelta24h: 0, whaleNetFlow: 0 });
      const { band, posture } = bandAndPosture(nciRaw);

      const tokenData = {
        mint,
        holders,
        topWhales: topWhales.length,
        whaleConcentration: concentrationPct.toFixed(2) + "%",
        nciRaw: nciRaw.toFixed(1),
        band,
        posture,
      };

      const prompt = `Analyze this Solana token:\nMint: ${mint}\nHolders: ${holders}\nTop 20 whales hold: ${concentrationPct.toFixed(1)}% of supply\nNCI Score: ${nciRaw.toFixed(1)}/100 (${band})\nPosture: ${posture}\n\nProvide a brief, actionable analysis covering: holder distribution health, whale risk, and overall conviction assessment. Keep it concise (under 200 words). Use a direct, analytical tone.`;

      let aiAnalysis: string | null = null;
      try {
        const agentRes = await fetch("http://localhost:3001/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: prompt, thread_id: `analyze_${mint}` }),
          signal: AbortSignal.timeout(30000),
        });
        if (agentRes.ok) {
          const agentData = await agentRes.json();
          aiAnalysis = agentData.response || null;
        }
      } catch {
        // BabyAGI 3 not available, skip AI analysis
      }

      res.json({
        ...tokenData,
        aiAnalysis,
        analyzedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      console.error("Analyze error:", e);
      res.status(500).json({ message: e.message || "Failed to analyze token" });
    }
  });

  return httpServer;
}
