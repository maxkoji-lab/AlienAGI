import { useMetrics, useLatestMetric, useBrief } from "@/hooks/use-metrics";
import { TerminalCard } from "@/components/TerminalCard";
import { MetricValue } from "@/components/MetricValue";
import { NciChart } from "@/components/NciChart";
import { ScannerChart, type ScannerLiveData } from "@/components/ScannerChart";
import { BriefTerminal } from "@/components/BriefTerminal";
import { Activity, Users, TrendingUp, Cpu, AlertTriangle, Vault, Search, Loader2, Scan, ExternalLink, Globe, Bell, Radio } from "lucide-react";
import alienBg from "@assets/VS_1770881377474.png";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function useWorldClocks() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fmt = (tz: string) =>
    now.toLocaleTimeString("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

  return {
    us: fmt("America/New_York"),
    eu: fmt("Europe/London"),
    asia: fmt("Asia/Tokyo"),
  };
}

interface TokenProfile {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string | null;
  priceUsd: string | null;
  marketCap: number | null;
  fdv: number | null;
  volume24h: number | null;
  websites: { url: string; label?: string }[];
  socials: { url: string; type: string }[];
  twitterHandle: string | null;
  telegramUrl: string | null;
  discordUrl: string | null;
  dexscreenerUrl: string | null;
}

interface XAlert {
  id: string;
  username: string;
  displayName: string;
  followers: number;
  tweetText: string;
  tweetUrl: string;
  detectedAt: string;
  tokenMint: string;
  tokenSymbol: string;
}

interface TokenAnalysis {
  mint: string;
  holders: number;
  topWhales: number;
  whaleConcentration: string;
  nciRaw: string;
  band: string;
  posture: string;
  aiAnalysis: string | null;
  analyzedAt: string;
  profile: TokenProfile | null;
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const clocks = useWorldClocks();
  const { data: metrics, isLoading: loadingMetrics } = useMetrics();
  const { data: latest, isLoading: loadingLatest } = useLatestMetric();
  const { data: brief, isLoading: loadingBrief } = useBrief();
  const [contractAddress, setContractAddress] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<TokenAnalysis | null>(null);
  const [scannerLive, setScannerLive] = useState<ScannerLiveData | null>(null);
  const { toast } = useToast();

  const { data: xAlerts = [] } = useQuery<XAlert[]>({
    queryKey: ["/api/x-monitor/alerts", analysis?.mint],
    queryFn: async () => {
      if (!analysis) return [];
      const res = await fetch(`/api/x-monitor/alerts?mint=${analysis.mint}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!analysis,
    refetchInterval: 30000,
  });

  const { data: monitorStatus } = useQuery<{ active: boolean; token: { mint: string; symbol: string } | null; alertCount: number }>({
    queryKey: ["/api/x-monitor/status"],
    enabled: !!analysis,
    refetchInterval: 30000,
  });

  const handleLiveUpdate = useCallback((data: ScannerLiveData) => {
    setScannerLive(data);
  }, []);

  const handleAnalyze = useCallback(async () => {
    const trimmed = contractAddress.trim();
    if (!trimmed || trimmed.length < 30) {
      toast({ title: "Invalid Address", description: "Enter a valid Solana token contract address.", variant: "destructive" });
      return;
    }
    setAnalyzing(true);
    setAnalysis(null);
    setScannerLive(null);
    try {
      const res = await apiRequest("POST", "/api/analyze", { mint: trimmed });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Unknown error" }));
        toast({ title: "Analysis Failed", description: err.message || `Server error (${res.status})`, variant: "destructive" });
        return;
      }
      const data = await res.json();
      setAnalysis(data);
      setScannerLive({
        nci: parseFloat(data.nciRaw),
        holders: data.holders,
        whaleConcentration: parseFloat(data.whaleConcentration),
        band: data.band,
        posture: data.posture,
        prevNci: parseFloat(data.nciRaw),
        prevHolders: data.holders,
      });
    } catch (e: any) {
      toast({ title: "Analysis Failed", description: e.message || "Could not analyze token.", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  }, [contractAddress, toast]);

  if (loadingMetrics || loadingLatest || !metrics) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-primary p-4">
        <div className="w-64 space-y-4 text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <h2 className="text-xl font-display tracking-widest animate-pulse">INITIALIZING SYSTEM...</h2>
          <div className="h-1 w-full bg-muted overflow-hidden">
             <motion.div 
               className="h-full bg-primary"
               initial={{ width: "0%" }}
               animate={{ width: "100%" }}
               transition={{ duration: 2, repeat: Infinity }}
             />
          </div>
          <p className="text-xs text-muted-foreground font-mono">Connecting to Solana neural interface</p>
        </div>
        <div className="scanline"></div>
      </div>
    );
  }

  // Calculate trends
  const previousMetric = metrics.length > 1 ? metrics[metrics.length - 2] : null;
  
  const getTrend = (current: number, prev: number | undefined) => {
    if (!prev) return "neutral";
    if (current > prev) return "up";
    if (current < prev) return "down";
    return "neutral";
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 relative overflow-hidden">
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: `url(${alienBg})`,
          backgroundSize: "contain",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          opacity: 0.55,
        }}
      />
      <div className="scanline"></div>
      
      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-primary/20 pb-6">
          <div className="space-y-1">
            <h1 className="text-3xl md:text-5xl tracking-tighter glow-text">
              ALIEN<span className="text-foreground">AGI</span> <span className="text-xs align-top opacity-70">v1.0.3</span>
            </h1>
            <p className="text-sm font-mono text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              SYSTEM OPERATIONAL // BABYAGI-3 ACTIVE
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              className="border-cyan-500/50 text-cyan-400 font-mono gap-2"
              onClick={() => navigate("/treasury")}
              data-testid="button-go-treasury"
            >
              <Vault className="w-4 h-4" />
              TREASURY
            </Button>
            <div className="hidden md:flex items-center gap-3">
              <div className="text-center" data-testid="clock-us">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">US/ET</p>
                <p className="font-mono text-primary font-bold text-sm">{clocks.us}</p>
              </div>
              <div className="w-px h-6 bg-primary/20" />
              <div className="text-center" data-testid="clock-eu">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">EU/GMT</p>
                <p className="font-mono text-cyan-400 font-bold text-sm">{clocks.eu}</p>
              </div>
              <div className="w-px h-6 bg-primary/20" />
              <div className="text-center" data-testid="clock-asia">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">ASIA/JST</p>
                <p className="font-mono text-purple-400 font-bold text-sm">{clocks.asia}</p>
              </div>
            </div>
            <div className="p-2 border border-primary/30 bg-primary/5 rounded-sm">
              <Cpu className="w-6 h-6 text-primary animate-pulse" />
            </div>
          </div>
        </header>

        {/* Top Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <TerminalCard title="Alien Conviction Index" delay={0.1} highlight>
            <div className="flex items-center justify-between">
              <MetricValue 
                label={analysis ? "Scanned NCI" : "Current NCI"}
                value={
                  scannerLive
                    ? scannerLive.nci.toFixed(2)
                    : analysis
                      ? parseFloat(analysis.nciRaw).toFixed(2)
                      : latest?.nciRaw.toFixed(4) || "0.0000"
                }
                trend={
                  scannerLive
                    ? getTrend(scannerLive.nci, scannerLive.prevNci)
                    : getTrend(latest?.nciRaw || 0, previousMetric?.nciRaw)
                }
                color="secondary"
              />
              <Activity className="w-8 h-8 text-secondary/50" />
            </div>
            {analysis && (
              <div className="mt-2 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                <span className="text-[9px] font-mono text-muted-foreground truncate">
                  {analysis.mint.slice(0, 6)}...{analysis.mint.slice(-4)}
                </span>
              </div>
            )}
          </TerminalCard>

          <TerminalCard title="Holder Distribution" delay={0.2}>
            <div className="flex items-center justify-between">
              <MetricValue 
                label={analysis ? "Scanned Holders" : "Total Holders"}
                value={
                  scannerLive
                    ? scannerLive.holders.toLocaleString()
                    : analysis
                      ? analysis.holders.toLocaleString()
                      : latest?.holders.toLocaleString() || "0"
                }
                trend={
                  scannerLive
                    ? getTrend(scannerLive.holders, scannerLive.prevHolders)
                    : getTrend(latest?.holders || 0, previousMetric?.holders)
                }
                color="primary"
              />
              <Users className="w-8 h-8 text-primary/50" />
            </div>
          </TerminalCard>

          <TerminalCard title="Whale Net Flow" delay={0.3}>
            <div className="flex items-center justify-between">
              <MetricValue 
                label={analysis ? "Whale Concentration" : "24h Net Flow"}
                value={
                  scannerLive
                    ? scannerLive.whaleConcentration.toFixed(2) + "%"
                    : analysis
                      ? analysis.whaleConcentration
                      : latest?.whaleNetFlow.toFixed(2) + "%" || "0%"
                }
                trend={
                  scannerLive
                    ? "neutral"
                    : analysis
                      ? "neutral"
                      : latest?.whaleNetFlow && latest.whaleNetFlow > 0 ? "up" : "down"
                }
                color="accent"
              />
              <TrendingUp className="w-8 h-8 text-accent/50" />
            </div>
          </TerminalCard>

          <TerminalCard title="System Posture" delay={0.4}>
             <div className="flex items-center justify-between h-full">
               <div className="flex flex-col">
                 <span className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Status</span>
                 <span className={cn(
                   "text-2xl font-display font-bold uppercase",
                   (scannerLive?.posture || analysis?.posture || latest?.posture) === "BULLISH" ? "text-primary" : 
                   (scannerLive?.posture || analysis?.posture || latest?.posture) === "BEARISH" ? "text-destructive" : "text-yellow-500"
                 )} data-testid="text-posture-status">
                   {scannerLive?.posture || analysis?.posture || latest?.posture || "ANALYZING"}
                 </span>
                 <span className="text-xs text-muted-foreground mt-1 font-mono" data-testid="text-posture-band">
                   Band: {scannerLive?.band || analysis?.band || latest?.band || "UNK"}
                 </span>
               </div>
               <AlertTriangle className={cn(
                 "w-8 h-8 opacity-50",
                 (scannerLive?.posture || analysis?.posture || latest?.posture) === "BULLISH" ? "text-primary" : "text-destructive"
               )} />
             </div>
          </TerminalCard>
        </div>

        {/* Token Analysis Input */}
        <TerminalCard title="Token Scanner" delay={0.45}>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter Solana token contract address..."
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !analyzing && handleAnalyze()}
                className="font-mono text-sm bg-black/30 border-primary/30 text-foreground placeholder:text-muted-foreground/50"
                data-testid="input-contract-address"
                disabled={analyzing}
              />
              <Button
                onClick={handleAnalyze}
                disabled={analyzing || !contractAddress.trim()}
                className="gap-2 font-mono border-primary/50 text-primary shrink-0"
                variant="outline"
                data-testid="button-analyze-token"
              >
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scan className="w-4 h-4" />}
                {analyzing ? "SCANNING..." : "ANALYZE"}
              </Button>
            </div>

            {analyzing && (
              <div className="flex items-center justify-center gap-3 py-6">
                <div className="w-3 h-3 bg-primary animate-ping rounded-full" />
                <span className="text-sm font-mono text-primary/70 animate-pulse">
                  SCANNING TOKEN // FETCHING HOLDER DATA // COMPUTING NCI...
                </span>
              </div>
            )}

            {analysis && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {analysis.profile && (
                  <div className="bg-black/40 border border-cyan-500/30 rounded-sm p-4" data-testid="section-token-profile">
                    <div className="flex items-start gap-4">
                      {analysis.profile.imageUrl && (
                        <img
                          src={analysis.profile.imageUrl}
                          alt={analysis.profile.name}
                          className="w-12 h-12 rounded-sm border border-cyan-500/30 shrink-0"
                          data-testid="img-token-logo"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-display text-lg text-cyan-400 tracking-wide" data-testid="text-token-name">
                            {analysis.profile.name}
                          </h3>
                          <span className="font-mono text-sm text-primary/80" data-testid="text-token-symbol">
                            ${analysis.profile.symbol}
                          </span>
                          {analysis.profile.priceUsd && (
                            <span className="font-mono text-sm text-foreground/70 ml-auto" data-testid="text-token-price">
                              ${parseFloat(analysis.profile.priceUsd) < 0.01 ? parseFloat(analysis.profile.priceUsd).toExponential(2) : parseFloat(analysis.profile.priceUsd).toFixed(4)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {analysis.profile.marketCap && (
                            <span className="text-[10px] font-mono text-muted-foreground" data-testid="text-token-mcap">
                              MCAP: ${analysis.profile.marketCap >= 1e6 ? (analysis.profile.marketCap / 1e6).toFixed(1) + "M" : analysis.profile.marketCap.toLocaleString()}
                            </span>
                          )}
                          {analysis.profile.volume24h && (
                            <span className="text-[10px] font-mono text-muted-foreground" data-testid="text-token-volume">
                              VOL24H: ${analysis.profile.volume24h >= 1e6 ? (analysis.profile.volume24h / 1e6).toFixed(1) + "M" : analysis.profile.volume24h.toLocaleString()}
                            </span>
                          )}
                          {analysis.profile.fdv && (
                            <span className="text-[10px] font-mono text-muted-foreground" data-testid="text-token-fdv">
                              FDV: ${analysis.profile.fdv >= 1e6 ? (analysis.profile.fdv / 1e6).toFixed(1) + "M" : analysis.profile.fdv.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {analysis.profile.description && (
                      <div className="mt-3 border-t border-cyan-500/10 pt-3" data-testid="section-token-lore">
                        <p className="text-[10px] text-cyan-400/70 uppercase tracking-widest mb-1">Lore / Description</p>
                        <p className="font-mono text-xs text-foreground/70 leading-relaxed">{analysis.profile.description}</p>
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-2 flex-wrap" data-testid="section-token-links">
                      {analysis.profile.websites.map((w, i) => (
                        <a key={i} href={w.url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-400/80 border border-cyan-500/20 rounded-sm px-2 py-0.5 transition-colors hover:border-cyan-500/50 hover:text-cyan-400"
                          data-testid={`link-website-${i}`}
                        >
                          <Globe className="w-3 h-3" />
                          {w.label || "Website"}
                        </a>
                      ))}
                      {analysis.profile.twitterHandle && (
                        <a href={`https://x.com/${analysis.profile.twitterHandle.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-400/80 border border-cyan-500/20 rounded-sm px-2 py-0.5 transition-colors hover:border-cyan-500/50 hover:text-cyan-400"
                          data-testid="link-twitter"
                        >
                          <span className="font-bold">X</span>
                          {analysis.profile.twitterHandle}
                        </a>
                      )}
                      {analysis.profile.telegramUrl && (
                        <a href={analysis.profile.telegramUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-400/80 border border-cyan-500/20 rounded-sm px-2 py-0.5 transition-colors hover:border-cyan-500/50 hover:text-cyan-400"
                          data-testid="link-telegram"
                        >
                          Telegram
                        </a>
                      )}
                      {analysis.profile.discordUrl && (
                        <a href={analysis.profile.discordUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-400/80 border border-cyan-500/20 rounded-sm px-2 py-0.5 transition-colors hover:border-cyan-500/50 hover:text-cyan-400"
                          data-testid="link-discord"
                        >
                          Discord
                        </a>
                      )}
                      {analysis.profile.dexscreenerUrl && (
                        <a href={analysis.profile.dexscreenerUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-400/80 border border-cyan-500/20 rounded-sm px-2 py-0.5 transition-colors hover:border-cyan-500/50 hover:text-cyan-400"
                          data-testid="link-dexscreener"
                        >
                          <ExternalLink className="w-3 h-3" />
                          DexScreener
                        </a>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-black/30 border border-primary/20 rounded-sm p-3" data-testid="text-analysis-holders">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Holders</p>
                    <p className="font-mono text-lg text-primary font-bold">{analysis.holders.toLocaleString()}</p>
                  </div>
                  <div className="bg-black/30 border border-cyan-500/20 rounded-sm p-3" data-testid="text-analysis-whales">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Whale Concentration</p>
                    <p className="font-mono text-lg text-cyan-400 font-bold">{analysis.whaleConcentration}</p>
                  </div>
                  <div className="bg-black/30 border border-secondary/20 rounded-sm p-3" data-testid="text-analysis-nci">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">NCI Score</p>
                    <p className="font-mono text-lg text-secondary font-bold">{analysis.nciRaw}/100</p>
                  </div>
                  <div className="bg-black/30 border border-purple-500/20 rounded-sm p-3" data-testid="text-analysis-band">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Band</p>
                    <p className="font-mono text-sm text-purple-400 font-bold">{analysis.band}</p>
                  </div>
                </div>

                <div className="bg-black/30 border border-primary/20 rounded-sm p-3" data-testid="text-analysis-posture">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Operator Posture</p>
                  <p className="font-mono text-sm text-foreground/80">{analysis.posture}</p>
                </div>

                {analysis.aiAnalysis && (
                  <div className="bg-black/30 border border-cyan-500/20 rounded-sm p-3" data-testid="text-analysis-ai">
                    <p className="text-[10px] text-cyan-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                      BabyAGI-3 Analysis
                    </p>
                    <p className="font-mono text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{analysis.aiAnalysis}</p>
                  </div>
                )}

                {xAlerts.length > 0 && (
                  <div className="bg-black/40 border border-yellow-500/30 rounded-sm p-3" data-testid="section-x-alerts">
                    <div className="flex items-center gap-2 mb-3">
                      <Bell className="w-4 h-4 text-yellow-400 animate-pulse" />
                      <p className="text-[10px] text-yellow-400 uppercase tracking-widest font-bold">
                        Influencer Alerts ({xAlerts.length})
                      </p>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {xAlerts.map((alert) => (
                        <a
                          key={alert.id}
                          href={alert.tweetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block bg-black/30 border border-yellow-500/10 rounded-sm p-2 transition-colors hover:border-yellow-500/30"
                          data-testid={`alert-${alert.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-yellow-400 font-bold">@{alert.username}</span>
                            <span className="text-[9px] text-muted-foreground">{alert.followers.toLocaleString()} followers</span>
                            <ExternalLink className="w-3 h-3 text-muted-foreground ml-auto" />
                          </div>
                          <p className="font-mono text-[11px] text-foreground/70 mt-1 line-clamp-2">{alert.tweetText}</p>
                          <p className="text-[9px] text-muted-foreground mt-1">{new Date(alert.detectedAt).toLocaleTimeString()}</p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className={cn("w-3 h-3", monitorStatus?.active ? "text-cyan-400 animate-pulse" : "text-muted-foreground")} />
                    <span className="text-[10px] font-mono text-cyan-400/70">
                      X MONITOR: {monitorStatus?.active
                        ? `TRACKING $${monitorStatus.token?.symbol || analysis.profile?.symbol || "?"} (${monitorStatus.alertCount} alerts)`
                        : analysis.profile?.twitterHandle
                          ? "STARTING..."
                          : "NO TWITTER DETECTED"}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Scanned at {new Date(analysis.analyzedAt).toLocaleTimeString()}
                  </p>
                </div>

                <div className="border-t border-cyan-500/20 pt-4 mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-widest">Live NCI Monitor</span>
                    <span className="text-[10px] font-mono text-muted-foreground ml-auto">Token: {analysis.mint.slice(0, 8)}...{analysis.mint.slice(-6)}</span>
                  </div>
                  <ScannerChart
                    mint={analysis.mint}
                    initialNci={parseFloat(analysis.nciRaw)}
                    initialHolders={analysis.holders}
                    initialWhaleConcentration={parseFloat(analysis.whaleConcentration)}
                    onLiveUpdate={handleLiveUpdate}
                  />
                </div>
              </motion.div>
            )}
          </div>
        </TerminalCard>

        {/* Chart Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <TerminalCard title="NCI Time Series Analysis" className="h-full min-h-[400px]" delay={0.5}>
              <div className="absolute top-4 right-4 flex gap-4 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-1" style={{ backgroundColor: "#00e5ff" }} />
                  <span className="text-muted-foreground">NCI Raw</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-1" style={{ backgroundColor: "#ff00ff", borderTop: "1px dashed #ff00ff" }} />
                  <span className="text-muted-foreground">EMA Trend</span>
                </div>
              </div>
              <NciChart data={metrics || []} />
            </TerminalCard>
          </div>

          {/* Terminal/Brief Section */}
          <div className="lg:col-span-1">
            <TerminalCard title="Operator Briefing" className="h-full min-h-[400px]" delay={0.6}>
              {loadingBrief ? (
                 <div className="h-full flex flex-col items-center justify-center text-primary/50 gap-2">
                   <div className="w-4 h-4 bg-primary/50 animate-ping rounded-full"></div>
                   <span className="text-xs animate-pulse">GENERATING INTELLIGENCE...</span>
                 </div>
              ) : (
                <BriefTerminal 
                  content={brief?.brief || "No briefing generated yet. Waiting for enough data points..."} 
                  generatedAt={brief?.generatedAt || new Date().toISOString()}
                />
              )}
            </TerminalCard>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-primary/20 pt-6 mt-8 flex flex-col md:flex-row justify-between items-center text-xs text-muted-foreground font-mono">
          <p>ALIENAGI OPERATOR TERMINAL // SYSTEM ID: XJ-9</p>
          <div className="flex gap-4 mt-2 md:mt-0">
            <span>LATENCY: 12ms</span>
            <span>NODES: 4 Active</span>
            <span className="text-primary">CONNECTED</span>
          </div>
        </footer>

      </div>
    </div>
  );
}
