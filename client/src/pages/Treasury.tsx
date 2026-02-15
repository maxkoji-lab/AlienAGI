import { useState } from "react";
import { TerminalCard } from "@/components/TerminalCard";
import { useTreasuryStats } from "@/hooks/use-treasury";
import { Flame, Gift, Wallet, ShieldCheck, ArrowLeft, ExternalLink, Globe, Loader2, Zap, CheckCircle, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

export default function Treasury() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: stats, isLoading: loadingStats } = useTreasuryStats();

  const { data: tokenData, isLoading: loadingToken } = useQuery<{ mint: string | null; profile: TokenProfile | null }>({
    queryKey: ["/api/treasury/token"],
    refetchInterval: 60000,
  });

  const { data: walletData } = useQuery<{ sol: number; publicKey: string }>({
    queryKey: ["/api/treasury/buyback/wallet"],
    refetchInterval: 30000,
  });

  const { data: buybackHistory } = useQuery<any[]>({
    queryKey: ["/api/treasury/buybacks"],
    refetchInterval: 15000,
  });

  const [solAmount, setSolAmount] = useState("0.01");
  const [slippage, setSlippage] = useState("100");
  const [lastResult, setLastResult] = useState<{ success: boolean; txSignature?: string; tokensReceived?: number; error?: string } | null>(null);

  const executeBuybackMutation = useMutation({
    mutationFn: async (params: { solAmount: number; slippageBps: number }) => {
      const adminKey = walletData?.publicKey || "";
      const res = await fetch("/api/treasury/buyback/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(err.message || "Buyback failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/buybacks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/buyback/wallet"] });
      if (data.success) {
        toast({ title: "Buyback Executed", description: `Acquired ${data.tokensReceived?.toLocaleString()} tokens` });
      } else {
        toast({ title: "Buyback Failed", description: data.error || data.message || "Transaction failed", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      const msg = err?.message || "Buyback failed";
      setLastResult({ success: false, error: msg });
      toast({ title: "Buyback Error", description: msg, variant: "destructive" });
    },
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

  const handleExecute = () => {
    const sol = parseFloat(solAmount);
    const slip = parseInt(slippage);
    if (isNaN(sol) || sol <= 0) {
      toast({ title: "Invalid amount", description: "Enter a valid SOL amount", variant: "destructive" });
      return;
    }
    if (walletData && sol > walletData.sol) {
      toast({ title: "Insufficient balance", description: `Wallet has ${walletData.sol.toFixed(4)} SOL`, variant: "destructive" });
      return;
    }
    setLastResult(null);
    executeBuybackMutation.mutate({ solAmount: sol, slippageBps: isNaN(slip) ? 100 : slip });
  };

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
              BUYBACK // BURN // REWARD TRACKER
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="p-2 border border-primary/20 bg-primary/5 rounded-sm">
              <ShieldCheck className="w-6 h-6 text-primary animate-pulse" />
            </div>
          </div>
        </header>

        {/* Token Profile Card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="bg-background/50 border border-primary/20 rounded-sm p-4" data-testid="section-treasury-token">
            {profile ? (
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
            ) : (
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 bg-accent rounded-full"></span>
                <span className="text-sm font-mono text-muted-foreground">
                  {mint ? `Token: ${mint.slice(0, 12)}...${mint.slice(-6)}` : "No token configured (NOOP_MINT not set)"}
                </span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Buyback Execution Panel */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}>
          <TerminalCard title="Execute Buyback" delay={0} highlight>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                  <Wallet className="w-4 h-4 text-primary" />
                  <span data-testid="text-wallet-balance">
                    Dev Wallet: {walletData ? `${walletData.sol.toFixed(4)} SOL` : "Loading..."}
                  </span>
                  {walletData && (
                    <span className="text-[10px] text-muted-foreground/60 truncate max-w-[180px]" data-testid="text-wallet-address">
                      {walletData.publicKey.slice(0, 6)}...{walletData.publicKey.slice(-4)}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider">SOL Amount</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={solAmount}
                    onChange={(e) => setSolAmount(e.target.value)}
                    className="w-full bg-background/60 border border-primary/20 text-primary font-mono px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-primary"
                    placeholder="0.01"
                    disabled={executeBuybackMutation.isPending}
                    data-testid="input-buyback-sol"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Slippage (bps)</label>
                  <div className="flex items-center gap-2">
                    {["50", "100", "200", "500"].map((v) => (
                      <Button
                        key={v}
                        variant={slippage === v ? "default" : "outline"}
                        size="sm"
                        className="font-mono text-xs"
                        onClick={() => setSlippage(v)}
                        disabled={executeBuybackMutation.isPending}
                        data-testid={`button-slippage-${v}`}
                      >
                        {(parseInt(v) / 100).toFixed(1)}%
                      </Button>
                    ))}
                    <input
                      type="number"
                      value={slippage}
                      onChange={(e) => setSlippage(e.target.value)}
                      className="w-16 bg-background/60 border border-primary/20 text-primary font-mono px-2 py-1 rounded-sm text-xs focus:outline-none focus:border-primary text-center"
                      disabled={executeBuybackMutation.isPending}
                      data-testid="input-slippage-custom"
                    />
                  </div>
                </div>

                <Button
                  className="w-full font-mono"
                  onClick={handleExecute}
                  disabled={executeBuybackMutation.isPending}
                  data-testid="button-execute-buyback"
                >
                  {executeBuybackMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> EXECUTING SWAP...</>
                  ) : (
                    <><Zap className="w-4 h-4 mr-2" /> EXECUTE BUYBACK</>
                  )}
                </Button>

                {lastResult && (
                  <div className={`border rounded-sm p-3 text-xs font-mono space-y-1 ${lastResult.success ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`} data-testid="section-buyback-result">
                    <div className="flex items-center gap-2">
                      {lastResult.success ? <CheckCircle className="w-4 h-4 text-primary" /> : <XCircle className="w-4 h-4 text-destructive" />}
                      <span className={lastResult.success ? "text-primary" : "text-destructive"}>
                        {lastResult.success ? "BUYBACK SUCCESSFUL" : "BUYBACK FAILED"}
                      </span>
                    </div>
                    {lastResult.tokensReceived != null && (
                      <p className="text-muted-foreground">Tokens received: <span className="text-secondary">{lastResult.tokensReceived.toLocaleString()}</span></p>
                    )}
                    {lastResult.txSignature && (
                      <a
                        href={`https://solscan.io/tx/${lastResult.txSignature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary/80 underline hover-elevate inline-block"
                        data-testid="link-buyback-tx"
                      >
                        View on Solscan
                      </a>
                    )}
                    {lastResult.error && <p className="text-destructive/80">{lastResult.error}</p>}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Recent Buybacks</h4>
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {!buybackHistory || buybackHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground font-mono">No buybacks executed yet</p>
                  ) : (
                    buybackHistory.slice(0, 10).map((b: any) => (
                      <div key={b.id} className="flex items-center justify-between gap-2 text-xs font-mono border-b border-primary/5 pb-1" data-testid={`row-buyback-${b.id}`}>
                        <div className="flex flex-col min-w-0">
                          <span className="text-primary">{b.amountSol} SOL</span>
                          <span className="text-muted-foreground">{Number(b.amountTokens).toLocaleString()} {symbol}</span>
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                          <span className={b.status === "executed" ? "text-primary" : b.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                            {b.status.toUpperCase()}
                          </span>
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
              </div>
            </div>
          </TerminalCard>
        </motion.div>

        {/* Stats Grid */}
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

        {/* Protocol Info */}
        <TerminalCard title={`${symbol} Treasury Protocol`} delay={0}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-sm">
            <div className="space-y-2">
              <h4 className="text-primary uppercase tracking-wider text-xs border-b border-primary/20 pb-1">Buyback Protocol</h4>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Treasury deploys SOL to acquire ${symbol} tokens from the open market via Jupiter V6 swap, reducing circulating supply.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-accent uppercase tracking-wider text-xs border-b border-accent/20 pb-1">Burn Mechanism</h4>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Acquired tokens are permanently destroyed, increasing scarcity and long-term value for remaining holders.
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

        <footer className="border-t border-primary/20 pt-6 flex flex-col md:flex-row justify-between items-center gap-2 text-xs text-muted-foreground font-mono">
          <p data-testid="text-treasury-footer">PippinAGI TREASURY OPS // ${symbol} PROTOCOL</p>
          <div className="flex gap-4">
            <span>CAMPAIGNS: {stats?.activeCampaigns || 0}</span>
            <span>BURNED: {burnedTokens.toLocaleString()}</span>
            <span className="text-primary">ACTIVE</span>
          </div>
        </footer>
      </div>
    </div>
  );
}