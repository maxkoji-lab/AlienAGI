import { storage } from "../storage";

// Config
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || "";
const NOOP_MINT = process.env.NOOP_MINT || "";
const NOOP_LOOP_SECONDS = parseInt(process.env.NOOP_LOOP_SECONDS || "90");
const NOOP_WHALE_TOP_N = parseInt(process.env.NOOP_WHALE_TOP_N || "20");
const NOOP_WHALE_WINDOW_HOURS = parseFloat(process.env.NOOP_WHALE_WINDOW_HOURS || "6");

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const HELIUS_ENHANCED_BASE = "https://api-mainnet.helius-rpc.com/v0";

function clip(x: number, lo: number = 0.0, hi: number = 1.0): number {
  return Math.max(lo, Math.min(hi, x));
}

// Helius Helpers
async function rpcPost(method: string, params: any): Promise<any> {
  if (!HELIUS_API_KEY) throw new Error("HELIUS_API_KEY missing");
  
  const response = await fetch(HELIUS_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Helius RPC Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result;
}

async function getHoldersSnapshot(mint: string, minUiAmount: number = 0.0): Promise<{ holders: number, ownerBal: Record<string, number> }> {
  let page = 1;
  const ownerBal: Record<string, number> = {};

  while (true) {
    const res = await rpcPost("getTokenAccounts", {
      mint,
      page,
      limit: 1000,
      displayOptions: {},
    });

    const accounts = res?.tokenAccounts || [];
    if (!accounts.length) break;

    for (const ta of accounts) {
      const owner = ta.owner;
      const ui = parseFloat(ta.tokenAmount?.uiAmount || "0");
      if (!owner) continue;
      ownerBal[owner] = (ownerBal[owner] || 0) + ui;
    }

    if (accounts.length < 1000) break;
    page++;
  }

  // Filter dust
  const filteredOwnerBal: Record<string, number> = {};
  for (const [o, b] of Object.entries(ownerBal)) {
    if (b > minUiAmount) filteredOwnerBal[o] = b;
  }

  return { holders: Object.keys(filteredOwnerBal).length, ownerBal: filteredOwnerBal };
}

async function getEnhancedTxs(address: string, limit: number = 100): Promise<any[]> {
  const url = `${HELIUS_ENHANCED_BASE}/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Helius Enhanced API Error: ${res.status}`);
  return await res.json();
}

async function whaleNetFlowOwner(owner: string, mint: string, windowSeconds: number, stopSig?: string): Promise<{ net: number, newestSig?: string }> {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - windowSeconds;

  let txs: any[] = [];
  try {
    txs = await getEnhancedTxs(owner, 100);
  } catch (e) {
    console.error(`Error fetching txs for ${owner}:`, e);
    return { net: 0 };
  }

  if (!txs.length) return { net: 0 };
  const newestSig = txs[0].signature;

  let net = 0.0;
  for (const tx of txs) {
    const sig = tx.signature;
    if (stopSig && sig === stopSig) break;

    const ts = tx.timestamp || tx.blockTime || 0;
    if (ts < cutoff) continue;

    for (const t of (tx.tokenTransfers || [])) {
      if ((t.mint || "").trim() !== mint) continue;

      const fromU = (t.fromUserAccount || "").trim();
      const toU = (t.toUserAccount || "").trim();
      const amt = parseFloat(t.tokenAmount || "0");

      if (toU === owner) net += amt;
      if (fromU === owner) net -= amt;
    }
  }

  return { net, newestSig };
}

// NCI Calculation
interface NCIInputs {
  holders: number;
  holdersDelta24h: number;
  whaleNetFlow: number;
}

function computeNciRaw(inp: NCIInputs): number {
  // Holder growth: -20 -> 0, +100 -> 1
  const H = clip((inp.holdersDelta24h + 20) / 120.0);

  // Whale flow logistic squash
  const baseK = 0.0005;
  const sizeFactor = 1.0 + clip(inp.holders / 20000.0);
  const k = baseK / sizeFactor;
  const W = 1.0 / (1.0 + Math.exp(-k * inp.whaleNetFlow));

  const S = clip(inp.holders / 20000.0);
  const F = clip(1.0 - H);

  const raw01 = (0.45 * H) + (0.30 * W) + (0.15 * S) + (0.10 * (1.0 - F));
  return 100.0 * raw01;
}

function ema(prev: number | undefined, current: number, alpha: number = 0.35): number {
  return prev === undefined ? current : (alpha * current + (1 - alpha) * prev);
}

export function bandAndPosture(nci: number): { band: string, posture: string } {
  if (nci < 25) return { band: "0–24 Survival", posture: "Calm resilience. Recruit builders. Minimal hype." };
  if (nci < 50) return { band: "25–49 Warm", posture: "Cautious optimism. Small raids. Meme-first." };
  if (nci < 70) return { band: "50–69 Conviction", posture: "Confident. Daily brief + raids + creator call." };
  if (nci < 85) return { band: "70–84 Momentum", posture: "Bigger raids. Whale watch. Celebrate wins, keep it tight." };
  return { band: "85–100 Euphoria", posture: "Hype + safety rails: anti-scam, sizing reminder, cool-down tone." };
}

export function buildBrief(mint: string, holders: number, holdersDelta24h: number, whaleFlow: number, nci: number, band: string, posture: string, whaleTopN: number, whaleWindowHours: number): string {
  const direction = whaleFlow > 0 ? "NET BUY" : (whaleFlow < 0 ? "NET SELL" : "FLAT");
  const dateStr = new Date().toLocaleString("en-SG", { timeZone: "Asia/Singapore" }); // Matches SGT from original

  return `# NOOP Brief — ${dateStr}

**Mint:** \`${mint}\`

## Conviction Index
- **NCI:** **${nci.toFixed(1)}/100**  (${band})
- **Operator posture:** ${posture}

## Community Growth
- **Holders (unique):** ${holders.toLocaleString()}
- **Holders Δ (approx 24h):** ${holdersDelta24h > 0 ? '+' : ''}${holdersDelta24h.toLocaleString()}

## Whale Watch (${whaleTopN} whales, ${whaleWindowHours}h window)
- **Whale net token flow:** ${whaleFlow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${direction})

## Today’s NOOP Moves
- Ship 1 meme + 1 short lore drop (<=120 words).
- Run a 10-minute raid window (funny, not spammy).
- Recruit 3 creators (memes / clips / edits).

## Raid Lines (copy-paste)
- NOOP doesn’t promise utility. It *becomes* the utility. 🧠
- If you’re reading this, you’re early. If you’re coping, you’re family.
- Conviction isn’t a tweet. It’s showing up again tomorrow.
`;
}

// Main Loop
export async function runOperatorLoop() {
  console.log("Starting NOOP Operator Loop...");
  
  const tick = async () => {
    // Refresh env vars
    const API_KEY = process.env.HELIUS_API_KEY || "";
    const MINT = process.env.NOOP_MINT || "";
    
    if (!API_KEY || !MINT) {
      console.log("Missing HELIUS_API_KEY or NOOP_MINT. Skipping tick.");
      return;
    }

    try {
      console.log("Fetching holders snapshot...");
      const { holders, ownerBal } = await getHoldersSnapshot(MINT);
      
      // Calculate delta 24h
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const metric24h = await storage.getMetricAtOrBefore(MINT, oneDayAgo);
      const holdersDelta24h = metric24h ? holders - metric24h.holders : 0;

      // Whale Flow
      console.log("Tracking whale flow...");
      const topWhales = Object.entries(ownerBal)
        .sort(([, a], [, b]) => b - a)
        .slice(0, NOOP_WHALE_TOP_N)
        .map(([owner]) => owner);
      
      let totalFlow = 0;
      const windowSeconds = NOOP_WHALE_WINDOW_HOURS * 3600;

      for (const w of topWhales) {
        const lastSig = await storage.getWhaleLastSig(w);
        const { net, newestSig } = await whaleNetFlowOwner(w, MINT, windowSeconds, lastSig);
        totalFlow += net;
        if (newestSig) {
          await storage.setWhaleLastSig(w, newestSig);
        }
      }

      // NCI
      const nciRaw = computeNciRaw({ holders, holdersDelta24h, whaleNetFlow: totalFlow });
      const latestMetric = await storage.getLatestMetric(MINT);
      const nciEma = ema(latestMetric?.nciEma, nciRaw);
      
      const { band, posture } = bandAndPosture(nciEma);

      // Save
      await storage.insertMetric({
        mint: MINT,
        holders,
        whaleNetFlow: totalFlow,
        nciRaw,
        nciEma,
        band,
        posture
      });

      console.log(`Tick complete. NCI: ${nciEma.toFixed(1)}`);
    } catch (e) {
      console.error("Operator loop error:", e);
    }
  };

  // Initial tick
  await tick();
  
  // Loop
  setInterval(tick, NOOP_LOOP_SECONDS * 1000);
}
