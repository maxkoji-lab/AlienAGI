import { useMetrics, useLatestMetric, useBrief } from "@/hooks/use-metrics";
import { TerminalCard } from "@/components/TerminalCard";
import { MetricValue } from "@/components/MetricValue";
import { NciChart } from "@/components/NciChart";
import { BriefTerminal } from "@/components/BriefTerminal";
import { Activity, Users, TrendingUp, Cpu, AlertTriangle, Vault } from "lucide-react";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";

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

export default function Dashboard() {
  const [, navigate] = useLocation();
  const clocks = useWorldClocks();
  const { data: metrics, isLoading: loadingMetrics } = useMetrics();
  const { data: latest, isLoading: loadingLatest } = useLatestMetric();
  const { data: brief, isLoading: loadingBrief } = useBrief();

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
                label="Current NCI"
                value={latest?.nciRaw.toFixed(4) || "0.0000"}
                trend={getTrend(latest?.nciRaw || 0, previousMetric?.nciRaw)}
                color="secondary"
              />
              <Activity className="w-8 h-8 text-secondary/50" />
            </div>
          </TerminalCard>

          <TerminalCard title="Holder Distribution" delay={0.2}>
            <div className="flex items-center justify-between">
              <MetricValue 
                label="Total Holders"
                value={latest?.holders.toLocaleString() || "0"}
                trend={getTrend(latest?.holders || 0, previousMetric?.holders)}
                color="primary"
              />
              <Users className="w-8 h-8 text-primary/50" />
            </div>
          </TerminalCard>

          <TerminalCard title="Whale Net Flow" delay={0.3}>
            <div className="flex items-center justify-between">
              <MetricValue 
                label="24h Net Flow"
                value={latest?.whaleNetFlow.toFixed(2) + "%" || "0%"}
                trend={latest?.whaleNetFlow && latest.whaleNetFlow > 0 ? "up" : "down"}
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
                   latest?.posture === "BULLISH" ? "text-primary" : 
                   latest?.posture === "BEARISH" ? "text-destructive" : "text-yellow-500"
                 )}>
                   {latest?.posture || "ANALYZING"}
                 </span>
                 <span className="text-xs text-muted-foreground mt-1 font-mono">
                   Band: {latest?.band || "UNK"}
                 </span>
               </div>
               <AlertTriangle className={cn(
                 "w-8 h-8 opacity-50",
                 latest?.posture === "BULLISH" ? "text-primary" : "text-destructive"
               )} />
             </div>
          </TerminalCard>
        </div>

        {/* Chart Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <TerminalCard title="NCI Time Series Analysis" className="h-full min-h-[400px]" delay={0.5}>
              <div className="absolute top-4 right-4 flex gap-4 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-1 bg-secondary"></span>
                  <span className="text-muted-foreground">NCI Raw</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-1 bg-accent border border-accent border-dashed"></span>
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
