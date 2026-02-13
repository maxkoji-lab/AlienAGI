import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
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
  Activity,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  DollarSign,
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
  priceAtTrade: number | null;
  tokenAmount: number | null;
}

interface EvalResult {
  action: string;
  confidence: number;
  nci: number;
  band: string;
  posture: string;
  shouldExecute: boolean;
}

interface PnLData {
  totalSpentSol: number;
  totalReceivedSol: number;
  realizedPnlSol: number;
  costBasisSol: number;
  hasOpenPosition: boolean;
  tradeCount: number;
}

interface AutoTraderProps {
  mint: string | null;
  tokenSymbol: string | null;
  currentNci: number | null;
  currentBand: string | null;
}

export function AutoTrader({ mint, tokenSymbol, currentNci, currentBand }: AutoTraderProps) {
  const { toast } = useToast();
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();

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

  const walletAddress = publicKey?.toBase58() || null;

  const { data: tradeHistory = [] } = useQuery<TradeSignal[]>({
    queryKey: [`/api/trade-signals?mint=${mint}`],
    enabled: !!mint,
    refetchInterval: 10000,
  });

  const { data: pnlData } = useQuery<PnLData>({
    queryKey: ["/api/trade/pnl", mint, walletAddress],
    enabled: !!mint && !!walletAddress,
    refetchInterval: 15000,
    queryFn: async () => {
      const res = await fetch(`/api/trade/pnl?mint=${mint}&wallet=${walletAddress}`);
      if (!res.ok) throw new Error("PnL fetch failed");
      return res.json();
    },
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
    if (botEnabled && mint && connected && currentNci !== null) {
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
  }, [botEnabled, mint, connected, currentNci, evaluateNci]);

  const executeTrade = useCallback(async (action: string) => {
    if (!mint || !connected || !publicKey || !signTransaction || executing) return;
    setExecuting(true);

    let signalId: number | null = null;
    const SOL_MINT = "So11111111111111111111111111111111111111112";
    const LAMPORTS_PER_SOL = 1_000_000_000;
    const amountSol = parseFloat(tradeAmountSol) || 0.1;

    try {
      const isBuy = action === "BUY";
      const inputMint = isBuy ? SOL_MINT : mint;
      const outputMint = isBuy ? mint : SOL_MINT;

      let amount: number;
      if (isBuy) {
        amount = Math.floor(amountSol * LAMPORTS_PER_SOL);
      } else {
        const reverseQuoteRes = await fetch(`/api/jupiter/quote?inputMint=${SOL_MINT}&outputMint=${mint}&amount=${Math.floor(amountSol * LAMPORTS_PER_SOL)}&slippageBps=${slippageBps}`);
        if (!reverseQuoteRes.ok) {
          const errText = await reverseQuoteRes.text();
          let errMsg = "Failed to calculate sell amount";
          try { errMsg = JSON.parse(errText).message || errMsg; } catch {}
          toast({ title: errMsg, variant: "destructive" });
          setExecuting(false);
          return;
        }
        const reverseQuote = await reverseQuoteRes.json();
        amount = parseInt(reverseQuote.outAmount || "0", 10);
      }

      toast({
        title: `${action} — Getting Quote`,
        description: `${amountSol} SOL via Jupiter`,
      });

      const quoteRes = await fetch(`/api/jupiter/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`);
      if (!quoteRes.ok) {
        const errText = await quoteRes.text();
        let errMsg = "Quote failed";
        try { errMsg = JSON.parse(errText).message || errMsg; } catch {}
        toast({ title: "Quote failed", description: errMsg, variant: "destructive" });
        setExecuting(false);
        return;
      }
      const quoteData = await quoteRes.json();

      const swapRes = await apiRequest("POST", "/api/jupiter/swap", {
        quoteResponse: quoteData,
        userPublicKey: publicKey.toBase58(),
      });
      const swapData = await swapRes.json();

      if (!swapData.swapTransaction) {
        toast({ title: "Swap build failed", variant: "destructive" });
        setExecuting(false);
        return;
      }

      const binaryStr = atob(swapData.swapTransaction);
      const txBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        txBytes[i] = binaryStr.charCodeAt(i);
      }
      const transaction = VersionedTransaction.deserialize(txBytes);

      toast({
        title: `${action} — Sign in Phantom`,
        description: "Please approve the transaction in your wallet",
      });

      const signedTx = await signTransaction(transaction);

      const txSignature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      });

      let tokenAmount = 0;
      let priceAtTrade = 0;
      try {
        if (isBuy && quoteData.outAmount) {
          tokenAmount = parseFloat(quoteData.outAmount);
        } else if (!isBuy) {
          tokenAmount = amount;
        }
        if (tokenAmount > 0 && amountSol > 0) {
          priceAtTrade = amountSol / tokenAmount;
        }
      } catch {}

      const signalRes = await apiRequest("POST", "/api/trade-signals", {
        mint,
        tokenSymbol: tokenSymbol || null,
        action,
        nciAtSignal: currentNci || 0,
        band: currentBand || "unknown",
        amountSol,
        walletAddress: publicKey.toBase58(),
        txSignature,
        status: "submitted",
        priceAtTrade: priceAtTrade || null,
        tokenAmount: tokenAmount || null,
      });
      await signalRes.json();
      queryClient.invalidateQueries({ queryKey: [`/api/trade-signals?mint=${mint}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/trade/pnl", mint, walletAddress] });

      toast({
        title: `${action} Submitted`,
        description: `TX: ${txSignature.slice(0, 8)}...${txSignature.slice(-8)}`,
      });
    } catch (e: any) {
      if (signalId) {
        await apiRequest("PATCH", `/api/trade-signals/${signalId}/status`, {
          status: "failed",
        }).catch(() => {});
        queryClient.invalidateQueries({ queryKey: [`/api/trade-signals?mint=${mint}`] });
      }

      const msg = e?.message || "Trade failed";
      if (msg.includes("User rejected")) {
        toast({ title: "Transaction cancelled", description: "You rejected the transaction in your wallet" });
      } else {
        toast({ title: `${action} Failed`, description: msg, variant: "destructive" });
      }
    }

    setExecuting(false);
  }, [mint, connected, publicKey, signTransaction, connection, tokenSymbol, currentNci, currentBand, tradeAmountSol, slippageBps, executing, walletAddress]);

  useEffect(() => {
    if (!botEnabled || !currentEval || !connected || !mint || executing) return;

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
  }, [currentEval, botEnabled, connected, mint, tradeHistory, maxTradesPerDay, executing, executeTrade]);

  const handleManualTrade = async (action: string) => {
    if (!mint) {
      toast({ title: "Scan a token first", variant: "destructive" });
      return;
    }
    if (!connected) {
      toast({ title: "Connect your Phantom wallet first", variant: "destructive" });
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

  const formatSol = (v: number) => {
    if (Math.abs(v) < 0.0001) return "0";
    return v.toFixed(4);
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

      <div className="flex items-center gap-2 flex-wrap">
        <div className="[&_button]:!h-7 [&_button]:!text-[10px] [&_button]:!font-mono [&_button]:!rounded-md [&_button]:!px-3 [&_button]:!border-primary/30 [&_button]:!bg-black/40">
          <WalletMultiButton />
        </div>
        {connected && walletAddress && (
          <span className="text-[9px] font-mono text-muted-foreground" data-testid="text-wallet-address">
            {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
          </span>
        )}
      </div>

      {connected && mint && pnlData && pnlData.tradeCount > 0 && (
        <div className="border border-primary/10 rounded-md p-3 bg-black/20" data-testid="section-pnl">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">P&L Summary</span>
            <span className="text-[9px] font-mono text-muted-foreground ml-auto">{pnlData.tradeCount} trades</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-[9px] font-mono text-muted-foreground uppercase">Spent</div>
              <div className="text-xs font-mono text-red-400" data-testid="text-pnl-spent">
                {formatSol(pnlData.totalSpentSol)} SOL
              </div>
            </div>
            <div className="text-center">
              <div className="text-[9px] font-mono text-muted-foreground uppercase">Received</div>
              <div className="text-xs font-mono text-green-400" data-testid="text-pnl-received">
                {formatSol(pnlData.totalReceivedSol)} SOL
              </div>
            </div>
            <div className="text-center">
              <div className="text-[9px] font-mono text-muted-foreground uppercase">Net P&L</div>
              <div className={cn(
                "text-xs font-mono font-bold flex items-center justify-center gap-0.5",
                pnlData.realizedPnlSol >= 0 ? "text-green-400" : "text-red-400"
              )} data-testid="text-pnl-realized">
                {pnlData.realizedPnlSol >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {pnlData.realizedPnlSol >= 0 ? "+" : ""}{formatSol(pnlData.realizedPnlSol)} SOL
              </div>
            </div>
          </div>
          {pnlData.hasOpenPosition && pnlData.costBasisSol > 0 && (
            <div className="mt-2 pt-2 border-t border-primary/10 flex items-center justify-center">
              <span className="text-[9px] font-mono text-yellow-400">Open position — cost basis: {formatSol(pnlData.costBasisSol)} SOL</span>
            </div>
          )}
        </div>
      )}

      {showSettings && (
        <div className="border border-primary/10 rounded-md p-3 space-y-3 bg-black/20">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Bot Configuration</div>
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
            <span>Trades signed by your Phantom wallet — you approve each transaction</span>
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

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant={botEnabled ? "destructive" : "default"}
          onClick={() => {
            if (!connected) {
              toast({ title: "Connect your Phantom wallet first", variant: "destructive" });
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
        {connected && mint && (
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
              <span className="text-[9px] font-mono mt-0.5">Connect wallet & start bot to trade</span>
            </div>
          ) : (
            tradeHistory.map((signal) => (
              <div
                key={signal.id}
                className="flex items-center gap-2 px-2 py-1.5 border border-primary/5 rounded-md bg-black/10 text-[10px] font-mono flex-wrap"
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
    </div>
  );
}
