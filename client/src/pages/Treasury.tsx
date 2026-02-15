import { TerminalCard } from "@/components/TerminalCard";
import { useTreasuryStats } from "@/hooks/use-treasury";
import { Flame, Gift, Wallet, ShieldCheck, ArrowLeft, ExternalLink, Globe, Activity, Clock, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

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
  twitterUrl: string | null;
  twitterHandle: string | null;
  telegramUrl: string | null;
  discordUrl: string | null;
  dexscreenerUrl: string | null;
}

interface AutoBuybackStatus {
  totalExecuted: number;
  totalFailed: number;
  lastExecutedAt: string | null;
  lastError: string | null;
  nextScheduledAt: string | null;
  isRunning: boolean;
  wallet: { sol: number; publicKey: string } | null;
}

function formatUsd(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(2)}K`;
  if (val >= 1) return `$${val.toFixed(2)}`;
  if (val > 0) return `$${val.toFixed(4)}`;
  return "$0.00";
}

function formatSol(val: number): string {
  if (val >= 1_000) return `${(val / 1_000).toFixed(2)}K SOL`;
  return `${val.toFixed(4)} SOL`;
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function timeUntil(isoStr: string): string {
  const diff = new Date(isoStr).getTime() - Date.now();
  if (diff <= 0) return "any moment";
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

export default function Treasury() {
  const [, navigate] = useLocation();
  const { data: stats, isLoading: loadingStats } = useTreasuryStats();

  const { data: tokenData, isLoading: loadingToken } = useQuery<{ mint: string | null; profile: TokenProfile | null }>({
    queryKey: ["/api/treasury/token"],
    refetchInterval: 60000,
  });

  const { data: buybackStatus } = useQuery<AutoBuybackStatus>({
    queryKey: ["/api/treasury/buyback/status"],
    refetchInterval: 10000,
  });

  const { data: buybackHistory } = useQuery<any[]>({
    queryKey: ["/api/treasury/buybacks"],
    refetchInterval: 15000,
  });

  const { data: burnHistory } = useQuery<any[]>({
    queryKey: ["/api/treasury/burns"],
    refetchInterval: 15000,
  });

  const profile = tokenData?.profile;
  const mint = tokenData?.mint;
  const tokenPrice = profile?.priceUsd ? parseFloat(profile.priceUsd) : 0;
  const symbol = profile?.symbol || "TOKEN";

  const buybackSol = stats?.totalBuybackSol || 0;
  const buybackTokens = stats?.totalBuybackTokens || 0;
  const burnedTokens = stats?.totalBurned || 0;
  const rewardsUsd = stats?.totalRewardsDistributed || 0;

  const buybackUsd = buybackTokens * tokenPrice;
  const burnedUsd = burnedTokens * tokenPrice;

  if (loadingStats || loadingToken) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-primary p-4">
        <div className="w-64 space-y-4 text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <h2 className="text-xl font-display tracking-widest animate-pulse">LOADING TREASURY...</h2>
        </div>
        <div className="scanline"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 relative overflow-hidden">
      <div className="scanline"></div>

      <div className="max-w-5xl mx-auto relative z-10 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-primary/20 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/")}
                className="text-primary"
                data-testid="button-back-dashboard"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-3xl md:text-5xl tracking-tighter glow-text" data-testid="text-treasury-title">
                TREASURY<span className="text-foreground"> OPS</span>
              </h1>
            </div>
            <p className="text-sm font-mono text-muted-foreground flex items-center gap-2 ml-12">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              AUTOMATED BUYBACK // BURN // REWARD TRACKER
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="p-2 border border-primary/20 bg-primary/5 rounded-sm">
              <ShieldCheck className="w-6 h-6 text-primary animate-pulse" />
            </div>
          </div>
        </header>

        {profile && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="bg-background/50 border border-primary/20 rounded-sm p-4" data-testid="section-treasury-token">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {profile.imageUrl && (
                    <img src={profile.imageUrl} alt={profile.name} className="w-12 h-12 rounded-sm border border-primary/20 shrink-0" data-testid="img-treasury-token-logo" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-lg text-primary tracking-wide" data-testid="text-treasury-token-name">{profile.name}</h3>
                      <span className="font-mono text-sm text-primary/80" data-testid="text-treasury-token-symbol">${profile.symbol}</span>
                    </div>
                    {mint && <p className="font-mono text-[10px] text-muted-foreground truncate" data-testid="text-treasury-mint">{mint}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap text-xs font-mono">
                  {profile.priceUsd && (
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground uppercase">Price</p>
                      <p className="text-primary font-bold" data-testid="text-treasury-price">${profile.priceUsd}</p>
                    </div>
                  )}
                  {profile.marketCap != null && (
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground uppercase">MCap</p>
                      <p className="text-secondary font-bold" data-testid="text-treasury-mcap">{formatUsd(profile.marketCap)}</p>
                    </div>
                  )}
                  {profile.volume24h != null && (
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground uppercase">24h Vol</p>
                      <p className="text-foreground/80" data-testid="text-treasury-volume">{formatUsd(profile.volume24h)}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {profile.websites?.map((w, i) => (
                    <a key={i} href={w.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-mono text-primary/80 border border-primary/20 rounded-sm px-2 py-0.5 hover-elevate" data-testid={`link-treasury-website-${i}`}>
                      <Globe className="w-3 h-3" />{w.label || "Website"}
                    </a>
                  ))}
                  {profile.twitterUrl && (
                    <a href={profile.twitterUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-mono text-primary/80 border border-primary/20 rounded-sm px-2 py-0.5 hover-elevate" data-testid="link-treasury-twitter">
                      <span className="font-bold">X</span>{profile.twitterHandle || "Twitter"}
                    </a>
                  )}
                  {profile.dexscreenerUrl && (
                    <a href={profile.dexscreenerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-mono text-primary/80 border border-primary/20 rounded-sm px-2 py-0.5 hover-elevate" data-testid="link-treasury-dexscreener">
                      <ExternalLink className="w-3 h-3" />DexScreener
                    </a>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
          <TerminalCard title="Auto-Buyback Engine" delay={0} highlight>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${buybackStatus?.isRunning ? "bg-primary animate-pulse" : "bg-muted-foreground"}`}></div>
                <span className="font-mono text-sm text-primary" data-testid="text-buyback-engine-status">
                  {buybackStatus?.isRunning ? "ENGINE ACTIVE" : "ENGINE OFFLINE"}
                </span>
              </div>
              <div className="flex items-center gap-6 text-xs font-mono flex-wrap">
                <div className="flex items-center gap-2">
                  <Activity className="w-3 h-3 text-primary" />
                  <span className="text-muted-foreground">Executed:</span>
                  <span className="text-primary" data-testid="text-cycles-executed">{buybackStatus?.totalExecuted || 0}</span>
                </div>
                {buybackStatus?.totalFailed ? (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Failed:</span>
                    <span className="text-destructive" data-testid="text-cycles-failed">{buybackStatus.totalFailed}</span>
                  </div>
                ) : null}
                {buybackStatus?.lastExecutedAt && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Last:</span>
                    <span className="text-foreground/80" data-testid="text-last-execution">{timeAgo(buybackStatus.lastExecutedAt)}</span>
                  </div>
                )}
                {buybackStatus?.nextScheduledAt && (
                  <div className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-primary" />
                    <span className="text-muted-foreground">Next:</span>
                    <span className="text-primary" data-testid="text-next-execution">{timeUntil(buybackStatus.nextScheduledAt)}</span>
                  </div>
                )}
              </div>
            </div>
            {buybackStatus?.lastError && (
              <div className="mt-2 text-xs font-mono text-destructive/80" data-testid="text-last-error">
                Last error: {buybackStatus.lastError}
              </div>
            )}
          </TerminalCard>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
            <TerminalCard title="Tokens Bought Back" delay={0}>
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">SOL Deployed</p>
                    <p className="text-2xl font-display text-primary tracking-wide" data-testid="text-buyback-sol">{formatSol(buybackSol)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">${symbol} Acquired</p>
                    <p className="text-xl font-display text-secondary tracking-wide" data-testid="text-buyback-tokens">{buybackTokens.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">USD Value</p>
                    <p className="text-lg font-mono text-foreground/80" data-testid="text-buyback-usd">{formatUsd(buybackUsd)}</p>
                  </div>
                </div>
                <Wallet className="w-10 h-10 text-primary/30 shrink-0" />
              </div>
            </TerminalCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
            <TerminalCard title="Tokens Burned" delay={0}>
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">${symbol} Destroyed</p>
                    <p className="text-2xl font-display text-accent tracking-wide" data-testid="text-burned-tokens">{burnedTokens.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">USD Value</p>
                    <p className="text-xl font-mono text-foreground/80" data-testid="text-burned-usd">{formatUsd(burnedUsd)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-accent rounded-full animate-pulse"></span>
                    <span className="text-[10px] font-mono text-accent/80">Deflationary</span>
                  </div>
                </div>
                <Flame className="w-10 h-10 text-accent/30 shrink-0" />
              </div>
            </TerminalCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }}>
            <TerminalCard title="Holder Rewards" delay={0}>
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Total Distributed</p>
                    <p className="text-2xl font-display text-secondary tracking-wide" data-testid="text-rewards-usd">{formatUsd(rewardsUsd)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Active Campaigns</p>
                    <p className="text-xl font-display text-primary tracking-wide" data-testid="text-active-campaigns">{stats?.activeCampaigns || 0}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-secondary rounded-full animate-pulse"></span>
                    <span className="text-[10px] font-mono text-secondary/80">Rewarding holders</span>
                  </div>
                </div>
                <Gift className="w-10 h-10 text-secondary/30 shrink-0" />
              </div>
            </TerminalCard>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.5 }}>
            <TerminalCard title="Recent Buybacks" delay={0}>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {!buybackHistory || buybackHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-mono" data-testid="text-no-buybacks">Awaiting first automated buyback cycle...</p>
                ) : (
                  buybackHistory.slice(0, 15).map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between gap-2 text-xs font-mono border-b border-primary/5 pb-1.5" data-testid={`row-buyback-${b.id}`}>
                      <div className="flex flex-col min-w-0">
                        <span className="text-primary">{Number(b.amountSol).toFixed(4)} SOL</span>
                        <span className="text-muted-foreground">{Number(b.amountTokens).toLocaleString()} {symbol}</span>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className={b.status === "executed" ? "text-primary" : b.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                          {b.status.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60">{b.ts ? timeAgo(b.ts) : ""}</span>
                        {b.txSignature && (
                          <a href={`https://solscan.io/tx/${b.txSignature}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary/60 hover-elevate" data-testid={`link-buyback-tx-${b.id}`}>
                            {b.txSignature.slice(0, 8)}...
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TerminalCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.6 }}>
            <TerminalCard title="Recent Burns" delay={0}>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {!burnHistory || burnHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-mono" data-testid="text-no-burns">Awaiting first automated burn cycle...</p>
                ) : (
                  burnHistory.slice(0, 15).map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between gap-2 text-xs font-mono border-b border-accent/5 pb-1.5" data-testid={`row-burn-${b.id}`}>
                      <div className="flex flex-col min-w-0">
                        <span className="text-accent">{Number(b.amountTokens).toLocaleString()} {symbol}</span>
                        <span className="text-[10px] text-muted-foreground/60">source: {b.source}</span>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className={b.status === "executed" ? "text-accent" : b.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                          {b.status.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60">{b.ts ? timeAgo(b.ts) : ""}</span>
                        {b.txSignature && (
                          <a href={`https://solscan.io/tx/${b.txSignature}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent/60 hover-elevate" data-testid={`link-burn-tx-${b.id}`}>
                            {b.txSignature.slice(0, 8)}...
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TerminalCard>
          </motion.div>
        </div>

        <TerminalCard title={`${symbol} Treasury Protocol`} delay={0}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-sm">
            <div className="space-y-2">
              <h4 className="text-primary uppercase tracking-wider text-xs border-b border-primary/20 pb-1">Buyback Protocol</h4>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Automated engine continuously acquires ${symbol} tokens via Jupiter V6 swap on Solana.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-accent uppercase tracking-wider text-xs border-b border-accent/20 pb-1">Auto-Burn</h4>
              <p className="text-muted-foreground text-xs leading-relaxed">
                All acquired tokens are immediately and permanently burned on-chain, reducing circulating supply automatically.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-secondary uppercase tracking-wider text-xs border-b border-secondary/20 pb-1">Holder Rewards</h4>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Qualified ${symbol} holders receive reward distributions through active campaigns based on holding thresholds.
              </p>
            </div>
          </div>
        </TerminalCard>

        <footer className="text-center text-xs font-mono text-muted-foreground/40 pb-4 pt-2">
          PIPPINAGI TREASURY // ALL OPERATIONS AUTOMATED // FULLY ON-CHAIN VERIFIED
        </footer>
      </div>
    </div>
  );
}
