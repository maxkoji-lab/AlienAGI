import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  Zap,
  Pause,
  Play,
  Settings,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Wallet,
  Activity,
  ExternalLink,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

interface TradeSignal {
  id: number;
  ts: string;
  mint: string;
  tokenSymbol: string | null;
  action: string;
  nciAtSignal: number;
  band: string;
  amountSol: number | null;
  walletAddress: string | null;
  txSignature: string | null;
  status: string;
}

interface EvalResult {
  action: string;
  confidence: number;
  nci: number;
  band: string;
  posture: string;
  shouldExecute: boolean;
}

interface WalletStatus {
  configured: boolean;
  address: string | null;
  error?: string;
}

interface AutoTraderProps {
  mint: string | null;
  tokenSymbol: string | null;
  currentNci: number | null;
  currentBand: string | null;
}

export function AutoTrader({ mint, tokenSymbol, currentNci, currentBand }: AutoTraderProps) {
  const { toast } = useToast();

  const [botEnabled, setBotEnabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [buyThreshold, setBuyThreshold] = useState(70);
  const [sellThreshold, setSellThreshold] = useState(25);
  const [tradeAmountSol, setTradeAmountSol] = useState("0.1");
  const [maxTradesPerDay, setMaxTradesPerDay] = useState(5);
  const [slippageBps, setSlippageBps] = useState(150);
  const evalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [executing, setExecuting] = useState(false);

  const [currentEval, setCurrentEval] = useState<EvalResult | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  const { data: walletStatus } = useQuery<WalletStatus>({
    queryKey: ["/api/trade/wallet"],
    refetchInterval: 30000,
  });

  const walletConfigured = walletStatus?.configured ?? false;
  const walletAddress = walletStatus?.address ?? null;

  const { data: tradeHistory = [] } = useQuery<TradeSignal[]>({
    queryKey: [`/api/trade-signals?mint=${mint}`],
    enabled: !!mint,
    refetchInterval: 10000,
  });

  const evaluateNci = useCallback(async () => {
    if (!mint || currentNci === null) return;
    setEvalLoading(true);
    try {
      const res = await fetch("/api/trade-signals/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mint, nci: currentNci, buyThreshold, sellThreshold }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentEval(data);
      }
    } catch {}
    setEvalLoading(false);
  }, [mint, currentNci, buyThreshold, sellThreshold]);

  useEffect(() => {
    if (mint && currentNci !== null) {
      evaluateNci();
    }
  }, [mint, currentNci, evaluateNci]);

  useEffect(() => {
    if (botEnabled && mint && walletConfigured && currentNci !== null) {
      evalIntervalRef.current = setInterval(() => {
        evaluateNci();
      }, 5000);
      return () => {
        if (evalIntervalRef.current) clearInterval(evalIntervalRef.current);
      };
    } else {
      if (evalIntervalRef.current) {
        clearInterval(evalIntervalRef.current);
        evalIntervalRef.current = null;
      }
    }
  }, [botEnabled, mint, walletConfigured, currentNci, evaluateNci]);

  const executeTrade = useCallback(async (action: string) => {
    if (!mint || !walletConfigured || executing) return;
    setExecuting(true);

    let signalId: number | null = null;

    try {
      const signalRes = await apiRequest("POST", "/api/trade-signals", {
        mint,
        tokenSymbol: tokenSymbol || null,
        action,
        nciAtSignal: currentNci || 0,
        band: currentBand || "unknown",
        amountSol: parseFloat(tradeAmountSol) || 0.1,
        walletAddress: walletAddress,
        status: "executing",
      });
      const signal = await signalRes.json();
      signalId = signal.id;
      queryClient.invalidateQueries({ queryKey: [`/api/trade-signals?mint=${mint}`] });

      toast({
        title: `${action} — Executing Trade`,
        description: `${parseFloat(tradeAmountSol) || 0.1} SOL via Jupiter — signing server-side`,
      });

      const execRes = await fetch("/api/trade/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mint,
          action,
          amountSol: parseFloat(tradeAmountSol) || 0.1,
          slippageBps,
        }),
      });

      const result = await execRes.json();

      if (execRes.ok && result.txSignature) {
        await apiRequest("PATCH", `/api/trade-signals/${signalId}/status`, {
          status: "submitted",
          txSignature: result.txSignature,
        });
        queryClient.invalidateQueries({ queryKey: [`/api/trade-signals?mint=${mint}`] });

        toast({
          title: `${action} Submitted`,
          description: `TX: ${result.txSignature.slice(0, 8)}...${result.txSignature.slice(-8)}`,
        });
      } else {
        await apiRequest("PATCH", `/api/trade-signals/${signalId}/status`, {
          status: "failed",
        });
        queryClient.invalidateQueries({ queryKey: [`/api/trade-signals?mint=${mint}`] });

        toast({
          title: `${action} Failed`,
          description: result.message || "Trade execution failed",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      if (signalId) {
        await apiRequest("PATCH", `/api/trade-signals/${signalId}/status`, {
          status: "failed",
        }).catch(() => {});
        queryClient.invalidateQueries({ queryKey: [`/api/trade-signals?mint=${mint}`] });
      }
      toast({
        title: `${action} Failed`,
        description: e?.message || "Trade execution failed",
        variant: "destructive",
      });
    }

    setExecuting(false);
  }, [mint, walletConfigured, walletAddress, tokenSymbol, currentNci, currentBand, tradeAmountSol, slippageBps, executing]);

  useEffect(() => {
    if (!botEnabled || !currentEval || !walletConfigured || !mint || executing) return;

    const todayExecutedSignals = tradeHistory.filter(s => {
      const signalDate = new Date(s.ts).toDateString();
      const isToday = signalDate === new Date().toDateString();
      const wasExecuted = s.status === "submitted" || s.status === "executed" || s.status === "executing";
      return isToday && wasExecuted;
    });

    if (todayExecutedSignals.length >= maxTradesPerDay) return;

    if (currentEval.shouldExecute && (currentEval.action === "BUY" || currentEval.action === "SELL")) {
      const recentSameAction = tradeHistory.find(s => {
        const timeDiff = Date.now() - new Date(s.ts).getTime();
        const wasExecuted = s.status === "submitted" || s.status === "executed" || s.status === "executing";
        return s.action === currentEval.action && timeDiff < 60000 && wasExecuted;
      });
      if (recentSameAction) return;

      executeTrade(currentEval.action);
    }
  }, [currentEval, botEnabled, walletConfigured, mint, tradeHistory, maxTradesPerDay, executing, executeTrade]);

  const handleManualTrade = async (action: string) => {
    if (!mint) {
      toast({ title: "Scan a token first", variant: "destructive" });
      return;
    }
    if (!walletConfigured) {
      toast({ title: "Wallet not configured", description: "Add your WALLET_PRIVATE_KEY in the Secrets tab", variant: "destructive" });
      return;
    }
    await executeTrade(action);
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "BUY": return "text-green-400";
      case "ACCUMULATE": return "text-cyan-400";
      case "SELL": return "text-red-400";
      case "HOLD": return "text-yellow-400";
      default: return "text-muted-foreground";
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "BUY":
      case "ACCUMULATE":
        return <ArrowUpRight className="w-3 h-3" />;
      case "SELL":
        return <ArrowDownRight className="w-3 h-3" />;
      default:
        return <Pause className="w-3 h-3" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "executed": return "bg-green-500/20 text-green-400";
      case "submitted": return "bg-green-500/20 text-green-300";
      case "executing": return "bg-blue-500/20 text-blue-400";
      case "signal_generated": return "bg-cyan-500/20 text-cyan-400";
      case "pending_approval": return "bg-yellow-500/20 text-yellow-400";
      case "rejected": return "bg-red-500/20 text-red-400";
      case "failed": return "bg-red-500/20 text-red-400";
      case "expired": return "bg-muted text-muted-foreground";
      default: return "bg-primary/10 text-primary";
    }
  };

  return (
    <div className="h-full flex flex-col gap-3" data-testid="section-auto-trader">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          <span className="text-[11px] font-mono uppercase tracking-widest text-primary">NCI Trade Bot</span>
          {botEnabled && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <span className="text-[9px] text-green-400 font-mono">ACTIVE</span>
            </span>
          )}
          {executing && (
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
              <span className="text-[9px] text-blue-400 font-mono">EXECUTING</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowSettings(!showSettings)}
            data-testid="button-bot-settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {walletConfigured ? (
          <div className="flex items-center gap-2 px-2.5 py-1 border border-green-500/30 rounded-md bg-green-500/10">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
            <span className="text-[10px] font-mono text-green-400">Wallet Connected</span>
            {walletAddress && (
              <span className="text-[9px] font-mono text-muted-foreground" data-testid="text-wallet-address">
                {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2.5 py-1 border border-yellow-500/30 rounded-md bg-yellow-500/10">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-[10px] font-mono text-yellow-400">No Wallet Key</span>
          </div>
        )}
      </div>

      {showSettings && (
        <div className="border border-primary/10 rounded-md p-3 space-y-3 bg-black/20">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Bot Configuration</div>

          {!walletConfigured && (
            <div className="border border-yellow-500/20 rounded-md p-2 bg-yellow-500/5 mb-2">
              <div className="flex items-center gap-2 mb-1">
                <KeyRound className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-[10px] font-mono text-yellow-300">Private Key Required</span>
              </div>
              <p className="text-[9px] font-mono text-muted-foreground leading-relaxed">
                Add your wallet's base58 private key as <span className="text-primary">WALLET_PRIVATE_KEY</span> in the Secrets tab.
                This enables direct trade execution without wallet popups.
                Use a dedicated trading wallet, not your main holdings.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] font-mono text-muted-foreground uppercase">Buy NCI Threshold</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={buyThreshold}
                onChange={(e) => setBuyThreshold(parseInt(e.target.value) || 70)}
                className="h-7 text-xs font-mono mt-0.5"
                data-testid="input-buy-threshold"
              />
            </div>
            <div>
              <label className="text-[9px] font-mono text-muted-foreground uppercase">Sell NCI Threshold</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={sellThreshold}
                onChange={(e) => setSellThreshold(parseInt(e.target.value) || 25)}
                className="h-7 text-xs font-mono mt-0.5"
                data-testid="input-sell-threshold"
              />
            </div>
            <div>
              <label className="text-[9px] font-mono text-muted-foreground uppercase">Trade Amount (SOL)</label>
              <Input
                type="text"
                value={tradeAmountSol}
                onChange={(e) => setTradeAmountSol(e.target.value)}
                className="h-7 text-xs font-mono mt-0.5"
                data-testid="input-trade-amount"
              />
            </div>
            <div>
              <label className="text-[9px] font-mono text-muted-foreground uppercase">Max Trades/Day</label>
              <Input
                type="number"
                min={1}
                max={50}
                value={maxTradesPerDay}
                onChange={(e) => setMaxTradesPerDay(parseInt(e.target.value) || 5)}
                className="h-7 text-xs font-mono mt-0.5"
                data-testid="input-max-trades"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[9px] font-mono text-muted-foreground uppercase">Slippage (bps, 100 = 1%)</label>
              <Input
                type="number"
                min={10}
                max={5000}
                value={slippageBps}
                onChange={(e) => setSlippageBps(parseInt(e.target.value) || 150)}
                className="h-7 text-xs font-mono mt-0.5"
                data-testid="input-slippage"
              />
            </div>
          </div>
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
            <ShieldCheck className="w-3 h-3" />
            <span>Trades execute directly via server-side signing</span>
          </div>
        </div>
      )}

      {mint && currentNci !== null && (
        <div className="border border-primary/10 rounded-md p-3 bg-black/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">NCI Signal</span>
            {evalLoading && <Loader2 className="w-3 h-3 animate-spin text-primary/50" />}
          </div>
          {currentEval ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className={cn("flex items-center gap-1 text-lg font-mono font-bold", getActionColor(currentEval.action))}>
                  {getActionIcon(currentEval.action)}
                  <span data-testid="text-signal-action">{currentEval.action}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-muted-foreground font-mono">Confidence</span>
                    <span className="text-[10px] font-mono text-primary" data-testid="text-signal-confidence">{currentEval.confidence}%</span>
                  </div>
                  <div className="w-full h-1 bg-muted rounded-full mt-0.5">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", currentEval.action === "BUY" ? "bg-green-400" : currentEval.action === "SELL" ? "bg-red-400" : "bg-primary")}
                      style={{ width: `${currentEval.confidence}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground">
                <span>NCI: {currentEval.nci.toFixed(1)}</span>
                <span className="text-primary/50">|</span>
                <span>{currentEval.band}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground/50">
              <Activity className="w-3 h-3" />
              <span className="text-[10px] font-mono">Scan a token to see signals</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={botEnabled ? "destructive" : "default"}
          onClick={() => {
            if (!walletConfigured) {
              toast({ title: "Add WALLET_PRIVATE_KEY first", description: "Open Settings for instructions", variant: "destructive" });
              return;
            }
            if (!mint) {
              toast({ title: "Scan a token first", variant: "destructive" });
              return;
            }
            setBotEnabled(!botEnabled);
            toast({
              title: botEnabled ? "Bot Disabled" : "Bot Enabled",
              description: botEnabled ? "Auto-trading stopped" : `Auto-trading ${tokenSymbol ? `$${tokenSymbol}` : "token"} based on NCI`,
            });
          }}
          data-testid="button-toggle-bot"
        >
          {botEnabled ? <><Pause className="w-3 h-3 mr-1" /> Stop Bot</> : <><Play className="w-3 h-3 mr-1" /> Start Bot</>}
        </Button>
        {walletConfigured && mint && (
          <div className="flex gap-1 ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleManualTrade("BUY")}
              disabled={executing}
              className="text-[10px]"
              data-testid="button-manual-buy"
            >
              {executing ? <Loader2 className="w-3 h-3 mr-0.5 animate-spin" /> : <ArrowUpRight className="w-3 h-3 mr-0.5" />} Buy
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleManualTrade("SELL")}
              disabled={executing}
              className="text-[10px]"
              data-testid="button-manual-sell"
            >
              {executing ? <Loader2 className="w-3 h-3 mr-0.5 animate-spin" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />} Sell
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
          Trade History {tradeHistory.length > 0 && `(${tradeHistory.length})`}
        </div>
        <div className="max-h-[160px] overflow-y-auto space-y-1">
          {tradeHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-muted-foreground/40">
              <Zap className="w-5 h-5 mb-1 opacity-30" />
              <span className="text-[10px] font-mono" data-testid="text-no-trades">NO TRADES YET</span>
              <span className="text-[9px] font-mono mt-0.5">Signals will appear when bot is active</span>
            </div>
          ) : (
            tradeHistory.map((signal) => (
              <div
                key={signal.id}
                className="flex items-center gap-2 px-2 py-1.5 border border-primary/5 rounded-md bg-black/10 text-[10px] font-mono"
                data-testid={`row-trade-${signal.id}`}
              >
                <span className={cn("font-bold", getActionColor(signal.action))}>
                  {signal.action}
                </span>
                <span className="text-muted-foreground">
                  NCI:{signal.nciAtSignal.toFixed(0)}
                </span>
                {signal.amountSol && (
                  <span className="text-primary/70">{signal.amountSol} SOL</span>
                )}
                <span className={cn("px-1 py-0.5 rounded text-[8px]", getStatusColor(signal.status))}>
                  {signal.status.replace(/_/g, " ")}
                </span>
                <span className="text-muted-foreground/40 ml-auto">
                  {new Date(signal.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                {signal.txSignature && (
                  <a
                    href={`https://solscan.io/tx/${signal.txSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary/50 hover:text-primary"
                    data-testid={`link-trade-tx-${signal.id}`}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {!walletConfigured && (
        <div className="border border-purple-500/20 rounded-md p-2 bg-purple-500/5">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-purple-400" />
            <div>
              <div className="text-[10px] font-mono text-purple-300">Add Trading Wallet Key</div>
              <div className="text-[9px] font-mono text-muted-foreground">
                Add <span className="text-primary">WALLET_PRIVATE_KEY</span> in Secrets tab for direct trade execution
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
