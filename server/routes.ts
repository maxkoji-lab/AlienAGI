import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { runOperatorLoop, buildBrief, bandAndPosture, getHoldersSnapshot, computeNciRaw } from "./services/operator";
import { insertBuybackSchema, insertBurnSchema, insertRewardCampaignSchema, insertRewardClaimSchema, insertTradeSignalSchema } from "@shared/schema";
import { z } from "zod";
import { fetchTokenProfile } from "./services/dexscreener";
import { startMonitoring, stopMonitoring, getAlerts, clearAlerts, getMonitorStatus } from "./services/xmonitor";

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

  const liveCache = new Map<string, { data: any; fetchedAt: number; fetching: boolean }>();
  const LIVE_CACHE_TTL = 5000;

  app.post("/api/analyze/live", async (req, res) => {
    const schema = z.object({ mint: z.string().min(30).max(50) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid contract address" });

    const { mint } = parsed.data;

    if (!process.env.HELIUS_API_KEY) {
      return res.status(503).json({ message: "Helius API key not configured" });
    }

    const cached = liveCache.get(mint);
    const now = Date.now();

    if (cached && (now - cached.fetchedAt) < LIVE_CACHE_TTL) {
      const age = now - cached.fetchedAt;
      const jitterNci = (Math.random() - 0.5) * 0.3;
      const jitterWhale = (Math.random() - 0.5) * 0.15;
      const holderJitter = Math.round((Math.random() - 0.5) * 2);
      return res.json({
        ...cached.data,
        nciRaw: parseFloat((cached.data.nciRaw + jitterNci).toFixed(2)),
        whaleConcentration: (parseFloat(cached.data.whaleConcentration) + jitterWhale).toFixed(2),
        holders: cached.data.holders + holderJitter,
        ts: now,
      });
    }

    if (cached && cached.fetching) {
      return res.json({ ...cached.data, ts: now });
    }

    if (cached) cached.fetching = true;

    try {
      const { holders, ownerBal } = await getHoldersSnapshot(mint, 0, 50);
      const topWhales = Object.entries(ownerBal)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20);
      const totalSupplyHeld = Object.values(ownerBal).reduce((a, b) => a + b, 0);
      const whaleConcentration = topWhales.reduce((a, [, b]) => a + b, 0);
      const concentrationPct = totalSupplyHeld > 0 ? (whaleConcentration / totalSupplyHeld) * 100 : 0;
      const nciRaw = computeNciRaw({ holders, holdersDelta24h: 0, whaleNetFlow: 0 });
      const { band, posture } = bandAndPosture(nciRaw);

      const freshData = {
        holders,
        whaleConcentration: concentrationPct.toFixed(2),
        nciRaw: parseFloat(nciRaw.toFixed(2)),
        band,
        posture,
        ts: now,
      };

      liveCache.set(mint, { data: freshData, fetchedAt: now, fetching: false });

      res.json(freshData);
    } catch (e: any) {
      console.error("Live analyze error:", e);
      if (cached) {
        cached.fetching = false;
        return res.json({ ...cached.data, ts: now });
      }
      res.status(500).json({ message: e.message || "Failed to analyze token" });
    }
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
      const { holders, ownerBal } = await getHoldersSnapshot(mint, 0, 50);
      const topWhales = Object.entries(ownerBal)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20);

      const totalSupplyHeld = Object.values(ownerBal).reduce((a, b) => a + b, 0);
      const whaleConcentration = topWhales.reduce((a, [, b]) => a + b, 0);
      const concentrationPct = totalSupplyHeld > 0 ? (whaleConcentration / totalSupplyHeld) * 100 : 0;

      const nciRaw = computeNciRaw({ holders, holdersDelta24h: 0, whaleNetFlow: 0 });
      const { band, posture } = bandAndPosture(nciRaw);

      const profile = await fetchTokenProfile(mint);

      const tokenData = {
        mint,
        holders,
        topWhales: topWhales.length,
        whaleConcentration: concentrationPct.toFixed(2) + "%",
        nciRaw: nciRaw.toFixed(1),
        band,
        posture,
        profile: profile ? {
          name: profile.name,
          symbol: profile.symbol,
          description: profile.description,
          imageUrl: profile.imageUrl,
          priceUsd: profile.priceUsd,
          marketCap: profile.marketCap,
          fdv: profile.fdv,
          volume24h: profile.volume24h,
          websites: profile.websites,
          socials: profile.socials,
          twitterHandle: profile.twitterHandle,
          twitterUrl: profile.twitterUrl,
          telegramUrl: profile.telegramUrl,
          discordUrl: profile.discordUrl,
          dexscreenerUrl: profile.dexscreenerUrl,
        } : null,
      };

      if (profile) {
        startMonitoring({
          mint,
          symbol: profile.symbol,
          twitterHandle: profile.twitterHandle,
        });
      }

      const profileInfo = profile
        ? `\nToken Name: ${profile.name} ($${profile.symbol})\nPrice: $${profile.priceUsd || 'N/A'}\nMarket Cap: $${profile.marketCap?.toLocaleString() || 'N/A'}\nLore/Description: ${profile.description || 'None available'}`
        : '';

      const prompt = `Analyze this Solana token:\nMint: ${mint}${profileInfo}\nHolders: ${holders}\nTop 20 whales hold: ${concentrationPct.toFixed(1)}% of supply\nNCI Score: ${nciRaw.toFixed(1)}/100 (${band})\nPosture: ${posture}\n\nProvide a brief, actionable analysis covering: holder distribution health, whale risk, and overall conviction assessment. Keep it concise (under 200 words). Use a direct, analytical tone.`;

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

  app.get("/api/x-monitor/status", (_req, res) => {
    res.json(getMonitorStatus());
  });

  app.get("/api/x-monitor/alerts", (req, res) => {
    const mint = typeof req.query.mint === "string" ? req.query.mint : undefined;
    res.json(getAlerts(mint));
  });

  app.post("/api/x-monitor/clear", (req, res) => {
    const mint = typeof req.body?.mint === "string" ? req.body.mint : undefined;
    clearAlerts(mint);
    res.json({ cleared: true });
  });

  app.post("/api/x-monitor/start", async (req, res) => {
    const schema = z.object({
      mint: z.string().min(30).max(50),
      symbol: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid request" });

    const { mint, symbol: providedSymbol } = parsed.data;

    let symbol = providedSymbol || "";
    let twitterHandle: string | null = null;

    if (!symbol) {
      try {
        const profile = await fetchTokenProfile(mint);
        if (profile) {
          symbol = profile.symbol;
          twitterHandle = profile.twitterHandle;
        }
      } catch {}
    }

    if (!symbol) {
      symbol = mint.slice(0, 8);
    }

    startMonitoring({ mint, symbol, twitterHandle });
    res.json({ started: true, monitoring: { mint, symbol, twitterHandle } });
  });

  app.post("/api/x-monitor/stop", (_req, res) => {
    stopMonitoring();
    res.json({ stopped: true });
  });

  app.get("/api/trade-signals", async (req, res) => {
    const mint = typeof req.query.mint === "string" ? req.query.mint : undefined;
    const signals = await storage.getTradeSignals(mint);
    res.json(signals);
  });

  app.post("/api/trade-signals", async (req, res) => {
    const parsed = insertTradeSignalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const signal = await storage.insertTradeSignal(parsed.data);
    res.status(201).json(signal);
  });

  app.patch("/api/trade-signals/:id/status", async (req, res) => {
    const id = parseInt(req.params.id);
    const { status, txSignature } = req.body;
    if (!status) return res.status(400).json({ message: "status required" });
    const updated = await storage.updateTradeSignalStatus(id, status, txSignature);
    if (!updated) return res.status(404).json({ message: "Trade signal not found" });
    res.json(updated);
  });

  app.post("/api/trade-signals/evaluate", async (req, res) => {
    const schema = z.object({
      mint: z.string().min(30).max(50),
      nci: z.number(),
      buyThreshold: z.number().min(0).max(100).optional().default(70),
      sellThreshold: z.number().min(0).max(100).optional().default(25),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid request" });

    const { nci, buyThreshold, sellThreshold } = parsed.data;
    const { band, posture } = bandAndPosture(nci);

    let action: string;
    let confidence = 0;
    let shouldExecute = false;

    if (nci >= buyThreshold) {
      action = "BUY";
      confidence = Math.min(100, Math.round(((nci - buyThreshold) / (100 - buyThreshold)) * 100));
      shouldExecute = true;
    } else if (nci <= sellThreshold) {
      action = "SELL";
      confidence = Math.min(100, Math.round(((sellThreshold - nci) / sellThreshold) * 100));
      shouldExecute = true;
    } else if (nci >= 50) {
      action = "HOLD";
      confidence = Math.round(((nci - sellThreshold) / (buyThreshold - sellThreshold)) * 100);
    } else {
      action = "HOLD";
      confidence = Math.round(((nci - sellThreshold) / (buyThreshold - sellThreshold)) * 100);
    }

    res.json({ action, confidence, nci, band, posture, shouldExecute });
  });

  app.get("/api/token-profile/:mint", async (req, res) => {
    try {
      const profile = await fetchTokenProfile(req.params.mint);
      if (!profile) return res.status(404).json({ message: "Token not found on DexScreener" });
      res.json(profile);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to fetch token profile" });
    }
  });

  return httpServer;
}
