import { useState } from "react";
import { TerminalCard } from "@/components/TerminalCard";
import { MetricValue } from "@/components/MetricValue";
import {
  useTreasuryStats,
  useBuybacks,
  useBurns,
  useRewardCampaigns,
  useCreateBuyback,
  useCreateBurn,
  useCreateRewardCampaign,
  useUpdateBuybackStatus,
  useUpdateBurnStatus,
  useToggleCampaign,
} from "@/hooks/use-treasury";
import { Flame, ArrowDownCircle, Gift, Wallet, ShieldCheck, ArrowLeft, ExternalLink, Globe, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
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

export default function Treasury() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: stats, isLoading: loadingStats } = useTreasuryStats();
  const { data: buybackList, isLoading: loadingBuybacks } = useBuybacks();
  const { data: burnList, isLoading: loadingBurns } = useBurns();
  const { data: campaigns, isLoading: loadingCampaigns } = useRewardCampaigns();

  const { data: tokenData, isLoading: loadingToken } = useQuery<{ mint: string | null; profile: TokenProfile | null }>({
    queryKey: ["/api/treasury/token"],
    refetchInterval: 60000,
  });

  const createBuyback = useCreateBuyback();
  const createBurn = useCreateBurn();
  const createCampaign = useCreateRewardCampaign();
  const updateBuybackStatus = useUpdateBuybackStatus();
  const updateBurnStatus = useUpdateBurnStatus();
  const toggleCampaign = useToggleCampaign();

  const [buybackForm, setBuybackForm] = useState({ amountSol: "", amountTokens: "" });
  const [burnForm, setBurnForm] = useState({ amountTokens: "", source: "buyback" });
  const [campaignForm, setCampaignForm] = useState({ name: "", minHoldingUsd: "10", rewardUsd: "0.2", totalBudgetUsd: "" });

  const profile = tokenData?.profile;
  const mint = tokenData?.mint;

  const handleCreateBuyback = () => {
    const sol = parseFloat(buybackForm.amountSol);
    const tokens = parseFloat(buybackForm.amountTokens);
    if (isNaN(sol) || isNaN(tokens) || sol <= 0 || tokens <= 0) {
      toast({ title: "Invalid input", description: "Enter valid amounts", variant: "destructive" });
      return;
    }
    createBuyback.mutate({ amountSol: sol, amountTokens: tokens }, {
      onSuccess: () => {
        toast({ title: "Buyback Proposed", description: `${sol} SOL buyback queued for ${profile?.symbol || "token"}` });
        setBuybackForm({ amountSol: "", amountTokens: "" });
      },
    });
  };

  const handleCreateBurn = () => {
    const tokens = parseFloat(burnForm.amountTokens);
    if (isNaN(tokens) || tokens <= 0) {
      toast({ title: "Invalid input", description: "Enter valid amount", variant: "destructive" });
      return;
    }
    createBurn.mutate({ amountTokens: tokens, source: burnForm.source }, {
      onSuccess: () => {
        toast({ title: "Burn Proposed", description: `${tokens.toLocaleString()} ${profile?.symbol || "tokens"} burn queued` });
        setBurnForm({ amountTokens: "", source: "buyback" });
      },
    });
  };

  const handleCreateCampaign = () => {
    const minHolding = parseFloat(campaignForm.minHoldingUsd);
    const reward = parseFloat(campaignForm.rewardUsd);
    const budget = parseFloat(campaignForm.totalBudgetUsd);
    if (!campaignForm.name || isNaN(minHolding) || isNaN(reward) || isNaN(budget) || budget <= 0) {
      toast({ title: "Invalid input", description: "Fill all fields correctly", variant: "destructive" });
      return;
    }
    createCampaign.mutate({ name: campaignForm.name, minHoldingUsd: minHolding, rewardUsd: reward, totalBudgetUsd: budget }, {
      onSuccess: () => {
        toast({ title: "Campaign Created", description: `"${campaignForm.name}" is now active for ${profile?.symbol || "token"} holders` });
        setCampaignForm({ name: "", minHoldingUsd: "10", rewardUsd: "0.2", totalBudgetUsd: "" });
      },
    });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "proposed": return "text-accent";
      case "executed": return "text-primary";
      case "failed": return "text-destructive";
      case "distributed": return "text-secondary";
      default: return "text-muted-foreground";
    }
  };

  if (loadingStats) {
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

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-primary/20 pb-6">
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
                TREASURY<span className="text-foreground"> OPS</span> <span className="text-xs align-top opacity-70">v1.0</span>
              </h1>
            </div>
            <p className="text-sm font-mono text-muted-foreground flex items-center gap-2 ml-12">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              BUYBACK // BURN // REWARD PROTOCOL
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="p-2 border border-primary/20 bg-primary/5 rounded-sm">
              <ShieldCheck className="w-6 h-6 text-primary animate-pulse" />
            </div>
          </div>
        </header>

        {/* Token Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="bg-background/50 border border-primary/20 rounded-sm p-4" data-testid="section-treasury-token">
            {loadingToken ? (
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm font-mono text-muted-foreground">Loading token profile...</span>
              </div>
            ) : profile ? (
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {profile.imageUrl && (
                    <img
                      src={profile.imageUrl}
                      alt={profile.name}
                      className="w-12 h-12 rounded-sm border border-primary/20 shrink-0"
                      data-testid="img-treasury-token-logo"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-lg text-primary tracking-wide" data-testid="text-treasury-token-name">
                        {profile.name}
                      </h3>
                      <span className="font-mono text-sm text-primary/80" data-testid="text-treasury-token-symbol">
                        ${profile.symbol}
                      </span>
                    </div>
                    {mint && (
                      <p className="font-mono text-[10px] text-muted-foreground truncate" data-testid="text-treasury-mint">
                        {mint}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-wrap text-xs font-mono">
                  {profile.priceUsd && (
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground uppercase">Price</p>
                      <p className="text-primary font-bold" data-testid="text-treasury-price">${profile.priceUsd}</p>
                    </div>
                  )}
                  {profile.marketCap && (
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground uppercase">MCap</p>
                      <p className="text-secondary font-bold" data-testid="text-treasury-mcap">${profile.marketCap.toLocaleString()}</p>
                    </div>
                  )}
                  {profile.volume24h && (
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground uppercase">24h Vol</p>
                      <p className="text-foreground/80" data-testid="text-treasury-volume">${profile.volume24h.toLocaleString()}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {profile.websites?.map((w, i) => (
                    <a key={i} href={w.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-mono text-primary/80 border border-primary/20 rounded-sm px-2 py-0.5 hover-elevate"
                      data-testid={`link-treasury-website-${i}`}
                    >
                      <Globe className="w-3 h-3" />
                      {w.label || "Website"}
                    </a>
                  ))}
                  {profile.twitterUrl && (
                    <a href={profile.twitterUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-mono text-primary/80 border border-primary/20 rounded-sm px-2 py-0.5 hover-elevate"
                      data-testid="link-treasury-twitter"
                    >
                      <span className="font-bold">X</span>
                      {profile.twitterHandle || "Twitter"}
                    </a>
                  )}
                  {profile.dexscreenerUrl && (
                    <a href={profile.dexscreenerUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-mono text-primary/80 border border-primary/20 rounded-sm px-2 py-0.5 hover-elevate"
                      data-testid="link-treasury-dexscreener"
                    >
                      <ExternalLink className="w-3 h-3" />
                      DexScreener
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <TerminalCard title={`Total Buyback (SOL)`} delay={0.1} highlight>
            <div className="flex items-center justify-between">
              <MetricValue
                label="SOL Deployed"
                value={stats?.totalBuybackSol?.toFixed(4) || "0.0000"}
                color="primary"
              />
              <Wallet className="w-8 h-8 text-primary/50" />
            </div>
          </TerminalCard>

          <TerminalCard title={`${profile?.symbol || "Tokens"} Bought Back`} delay={0.2}>
            <div className="flex items-center justify-between">
              <MetricValue
                label="Tokens Acquired"
                value={stats?.totalBuybackTokens?.toLocaleString() || "0"}
                color="secondary"
              />
              <ArrowDownCircle className="w-8 h-8 text-secondary/50" />
            </div>
          </TerminalCard>

          <TerminalCard title={`${profile?.symbol || "Tokens"} Burned`} delay={0.3}>
            <div className="flex items-center justify-between">
              <MetricValue
                label="Tokens Destroyed"
                value={stats?.totalBurned?.toLocaleString() || "0"}
                color="accent"
              />
              <Flame className="w-8 h-8 text-accent/50" />
            </div>
          </TerminalCard>

          <TerminalCard title="Rewards Distributed" delay={0.4}>
            <div className="flex items-center justify-between">
              <MetricValue
                label="Total USD"
                value={"$" + (stats?.totalRewardsDistributed?.toFixed(2) || "0.00")}
                color="primary"
              />
              <Gift className="w-8 h-8 text-primary/50" />
            </div>
          </TerminalCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <TerminalCard title={`Buyback System ${profile?.symbol ? `($${profile.symbol})` : ""}`} delay={0.5} className="min-h-[350px]">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-mono uppercase">SOL Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={buybackForm.amountSol}
                  onChange={(e) => setBuybackForm(p => ({ ...p, amountSol: e.target.value }))}
                  className="w-full bg-background/60 border border-primary/20 text-primary font-mono px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-primary"
                  placeholder="0.00"
                  data-testid="input-buyback-sol"
                />
                <label className="text-xs text-muted-foreground font-mono uppercase">{profile?.symbol || "Token"} Amount</label>
                <input
                  type="number"
                  step="1"
                  value={buybackForm.amountTokens}
                  onChange={(e) => setBuybackForm(p => ({ ...p, amountTokens: e.target.value }))}
                  className="w-full bg-background/60 border border-primary/20 text-primary font-mono px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-primary"
                  placeholder="0"
                  data-testid="input-buyback-tokens"
                />
                <Button
                  variant="outline"
                  className="w-full border-primary/30 text-primary font-mono"
                  onClick={handleCreateBuyback}
                  disabled={createBuyback.isPending}
                  data-testid="button-propose-buyback"
                >
                  {createBuyback.isPending ? "SUBMITTING..." : "PROPOSE BUYBACK"}
                </Button>
              </div>

              <div className="border-t border-primary/10 pt-3">
                <h4 className="text-xs text-muted-foreground font-mono mb-2 uppercase tracking-wider">Recent Buybacks</h4>
                <div className="space-y-1 max-h-[120px] overflow-y-auto">
                  {loadingBuybacks ? (
                    <p className="text-xs text-muted-foreground animate-pulse">Loading...</p>
                  ) : (buybackList as any[])?.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No buybacks yet</p>
                  ) : (
                    (buybackList as any[])?.slice(0, 5).map((b: any) => (
                      <div key={b.id} className="flex items-center justify-between text-xs font-mono" data-testid={`row-buyback-${b.id}`}>
                        <span className="text-primary/70">{b.amountSol} SOL</span>
                        <span className={statusColor(b.status)}>{b.status.toUpperCase()}</span>
                        {b.status === "proposed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-6 px-2 text-primary"
                            onClick={() => updateBuybackStatus.mutate({ id: b.id, status: "executed" })}
                            data-testid={`button-execute-buyback-${b.id}`}
                          >
                            EXEC
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </TerminalCard>

          <TerminalCard title={`Burn Allocation ${profile?.symbol ? `($${profile.symbol})` : ""}`} delay={0.6} className="min-h-[350px]">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-mono uppercase">{profile?.symbol || "Tokens"} to Burn</label>
                <input
                  type="number"
                  step="1"
                  value={burnForm.amountTokens}
                  onChange={(e) => setBurnForm(p => ({ ...p, amountTokens: e.target.value }))}
                  className="w-full bg-background/60 border border-accent/20 text-accent font-mono px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-accent"
                  placeholder="0"
                  data-testid="input-burn-tokens"
                />
                <label className="text-xs text-muted-foreground font-mono uppercase">Source</label>
                <select
                  value={burnForm.source}
                  onChange={(e) => setBurnForm(p => ({ ...p, source: e.target.value }))}
                  className="w-full bg-background/60 border border-primary/20 text-primary font-mono px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-primary"
                  data-testid="select-burn-source"
                >
                  <option value="buyback">From Buyback</option>
                  <option value="treasury">From Treasury</option>
                  <option value="tax">From Tax</option>
                </select>
                <Button
                  variant="outline"
                  className="w-full border-accent/30 text-accent font-mono"
                  onClick={handleCreateBurn}
                  disabled={createBurn.isPending}
                  data-testid="button-propose-burn"
                >
                  {createBurn.isPending ? "SUBMITTING..." : "PROPOSE BURN"}
                </Button>
              </div>

              <div className="border-t border-accent/10 pt-3">
                <h4 className="text-xs text-muted-foreground font-mono mb-2 uppercase tracking-wider">Recent Burns</h4>
                <div className="space-y-1 max-h-[120px] overflow-y-auto">
                  {loadingBurns ? (
                    <p className="text-xs text-muted-foreground animate-pulse">Loading...</p>
                  ) : (burnList as any[])?.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No burns yet</p>
                  ) : (
                    (burnList as any[])?.slice(0, 5).map((b: any) => (
                      <div key={b.id} className="flex items-center justify-between text-xs font-mono" data-testid={`row-burn-${b.id}`}>
                        <span className="text-accent/70">{Number(b.amountTokens).toLocaleString()} {profile?.symbol || "tokens"}</span>
                        <span className={statusColor(b.status)}>{b.status.toUpperCase()}</span>
                        {b.status === "proposed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-6 px-2 text-accent"
                            onClick={() => updateBurnStatus.mutate({ id: b.id, status: "executed" })}
                            data-testid={`button-execute-burn-${b.id}`}
                          >
                            EXEC
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </TerminalCard>

          <TerminalCard title={`Holder Rewards ${profile?.symbol ? `($${profile.symbol})` : ""}`} delay={0.7} className="min-h-[350px]">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-mono uppercase">Campaign Name</label>
                <input
                  type="text"
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-background/60 border border-secondary/20 text-secondary font-mono px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-secondary"
                  placeholder="Diamond Hands Airdrop"
                  data-testid="input-campaign-name"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground font-mono uppercase">Min Hold ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={campaignForm.minHoldingUsd}
                      onChange={(e) => setCampaignForm(p => ({ ...p, minHoldingUsd: e.target.value }))}
                      className="w-full bg-background/60 border border-secondary/20 text-secondary font-mono px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-secondary"
                      data-testid="input-campaign-min-hold"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-mono uppercase">Reward ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={campaignForm.rewardUsd}
                      onChange={(e) => setCampaignForm(p => ({ ...p, rewardUsd: e.target.value }))}
                      className="w-full bg-background/60 border border-secondary/20 text-secondary font-mono px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-secondary"
                      data-testid="input-campaign-reward"
                    />
                  </div>
                </div>
                <label className="text-xs text-muted-foreground font-mono uppercase">Total Budget ($)</label>
                <input
                  type="number"
                  step="1"
                  value={campaignForm.totalBudgetUsd}
                  onChange={(e) => setCampaignForm(p => ({ ...p, totalBudgetUsd: e.target.value }))}
                  className="w-full bg-background/60 border border-secondary/20 text-secondary font-mono px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-secondary"
                  placeholder="1000"
                  data-testid="input-campaign-budget"
                />
                <Button
                  variant="outline"
                  className="w-full border-secondary/30 text-secondary font-mono"
                  onClick={handleCreateCampaign}
                  disabled={createCampaign.isPending}
                  data-testid="button-create-campaign"
                >
                  {createCampaign.isPending ? "CREATING..." : "LAUNCH CAMPAIGN"}
                </Button>
              </div>

              <div className="border-t border-secondary/10 pt-3">
                <h4 className="text-xs text-muted-foreground font-mono mb-2 uppercase tracking-wider">Active Campaigns</h4>
                <div className="space-y-2 max-h-[100px] overflow-y-auto">
                  {loadingCampaigns ? (
                    <p className="text-xs text-muted-foreground animate-pulse">Loading...</p>
                  ) : (campaigns as any[])?.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No campaigns yet</p>
                  ) : (
                    (campaigns as any[])?.slice(0, 5).map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between text-xs font-mono gap-2" data-testid={`row-campaign-${c.id}`}>
                        <span className="text-secondary/70 truncate flex-1">{c.name}</span>
                        <span className="text-muted-foreground">{c.claimedCount} claims</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn("text-xs h-6 px-2", c.active ? "text-primary" : "text-destructive")}
                          onClick={() => toggleCampaign.mutate({ id: c.id, active: !c.active })}
                          data-testid={`button-toggle-campaign-${c.id}`}
                        >
                          {c.active ? "ON" : "OFF"}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </TerminalCard>
        </div>

        <TerminalCard title={`${profile?.symbol || "Token"} Treasury Protocol`} delay={0.8}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-sm">
            <div className="space-y-2">
              <h4 className="text-primary uppercase tracking-wider text-xs border-b border-primary/20 pb-1">Buyback Protocol</h4>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Treasury deploys SOL to acquire {profile?.symbol ? `$${profile.symbol}` : "PippinAGI"} tokens from the open market. Acquired tokens are allocated to burn pool or reward campaigns.
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 bg-primary rounded-full"></span>
                <span className="text-primary/80">Auto-execute on approval</span>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-accent uppercase tracking-wider text-xs border-b border-accent/20 pb-1">Burn Mechanism</h4>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Tokens from buybacks or treasury tax are permanently destroyed, reducing total supply and increasing scarcity for remaining holders.
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 bg-accent rounded-full"></span>
                <span className="text-accent/80">Deflationary pressure active</span>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-secondary uppercase tracking-wider text-xs border-b border-secondary/20 pb-1">Holder Rewards</h4>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Holders with sufficient {profile?.symbol ? `$${profile.symbol}` : "token"} balance qualify for reward distributions. Campaigns run on configurable budgets.
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 bg-secondary rounded-full"></span>
                <span className="text-secondary/80">{stats?.activeCampaigns || 0} active campaign(s)</span>
              </div>
            </div>
          </div>
        </TerminalCard>

        <footer className="border-t border-primary/20 pt-6 mt-8 flex flex-col md:flex-row justify-between items-center text-xs text-muted-foreground font-mono">
          <p>PippinAGI TREASURY OPS // {profile?.symbol ? `$${profile.symbol}` : "TOKEN"} PROTOCOL</p>
          <div className="flex gap-4 mt-2 md:mt-0">
            <span>CAMPAIGNS: {stats?.activeCampaigns || 0}</span>
            <span>BURNED: {stats?.totalBurned?.toLocaleString() || 0}</span>
            <span className="text-primary">ACTIVE</span>
          </div>
        </footer>
      </div>
    </div>
  );
}