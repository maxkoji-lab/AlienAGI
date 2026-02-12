import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { runOperatorLoop, buildBrief, bandAndPosture } from "./services/operator";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Start the background operator loop
  // We run this without awaiting so it doesn't block server startup
  runOperatorLoop().catch(console.error);

  app.get(api.metrics.list.path, async (req, res) => {
    const mint = process.env.NOOP_MINT;
    if (!mint) return res.json([]); // Or 500
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

    // Get 24h delta
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const metric24h = await storage.getMetricAtOrBefore(mint, oneDayAgo);
    const holdersDelta = metric24h ? metric.holders - metric24h.holders : 0;

    const { band, posture } = bandAndPosture(metric.nciEma);
    
    // We assume the stored flow is what we want for the brief (last tick's flow)
    // The Python script re-calculated or used the metric. The metric stores 'whaleNetFlow'.
    
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

  return httpServer;
}
