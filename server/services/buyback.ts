import { Connection, Keypair, VersionedTransaction, PublicKey, Transaction } from "@solana/web3.js";
import { createBurnInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import { storage } from "../storage";

const HELIUS_API_KEY_RAW = process.env.HELIUS_API_KEY || "";
const HELIUS_API_KEY = HELIUS_API_KEY_RAW.includes("api-key=")
  ? HELIUS_API_KEY_RAW.split("api-key=")[1].split("&")[0]
  : HELIUS_API_KEY_RAW;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const JUPITER_API_BASE = "https://public.jupiterapi.com";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const NOOP_MINT = process.env.NOOP_MINT || "";
const LAMPORTS_PER_SOL = 1_000_000_000;

const BUYBACK_SOL_AMOUNT = 0.05;
const BUYBACK_SLIPPAGE_BPS = 300;
const BUYBACK_INTERVAL_MIN_MS = 3 * 60 * 1000;
const BUYBACK_INTERVAL_MAX_MS = 5 * 60 * 1000;

let cachedTokenDecimals: number | null = null;
let autoBuybackRunning = false;
let autoBuybackStats = {
  totalExecuted: 0,
  totalFailed: 0,
  lastExecutedAt: null as string | null,
  lastError: null as string | null,
  nextScheduledAt: null as string | null,
  isRunning: false,
};

function loadWallet(): Keypair {
  const raw = process.env.WALLET_PRIVATE_KEY || "";
  if (!raw) throw new Error("WALLET_PRIVATE_KEY not set");

  try {
    if (raw.startsWith("[")) {
      const arr = JSON.parse(raw);
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch (e: any) {
    throw new Error(`Failed to parse WALLET_PRIVATE_KEY: ${e.message}`);
  }
}

async function getTokenDecimals(): Promise<number> {
  if (cachedTokenDecimals !== null) return cachedTokenDecimals;
  if (!NOOP_MINT) return 6;

  try {
    const connection = new Connection(HELIUS_RPC_URL, "confirmed");
    const mintPubkey = new PublicKey(NOOP_MINT);
    const info = await connection.getParsedAccountInfo(mintPubkey);
    const parsed = (info.value?.data as any)?.parsed;
    if (parsed?.info?.decimals != null) {
      cachedTokenDecimals = parsed.info.decimals as number;
      console.log(`[Buyback] Token decimals: ${cachedTokenDecimals}`);
      return cachedTokenDecimals;
    }
  } catch (e: any) {
    console.warn(`[Buyback] Failed to fetch token decimals, using 6: ${e.message}`);
  }
  return 6;
}

export function getWalletPublicKey(): string {
  const wallet = loadWallet();
  return wallet.publicKey.toBase58();
}

export async function getWalletBalance(): Promise<{ sol: number; publicKey: string }> {
  const wallet = loadWallet();
  const connection = new Connection(HELIUS_RPC_URL, "confirmed");
  const balance = await connection.getBalance(wallet.publicKey);
  return {
    sol: balance / LAMPORTS_PER_SOL,
    publicKey: wallet.publicKey.toBase58(),
  };
}

export function getAutoBuybackStatus() {
  return { ...autoBuybackStats };
}

async function executeBuybackAndBurn(): Promise<{
  success: boolean;
  buybackTx?: string;
  burnTx?: string;
  solSpent: number;
  tokensReceived: number;
  tokensBurned: number;
  error?: string;
}> {
  if (!NOOP_MINT) throw new Error("NOOP_MINT not configured");
  if (!process.env.WALLET_PRIVATE_KEY) throw new Error("WALLET_PRIVATE_KEY not set");

  const wallet = loadWallet();
  const connection = new Connection(HELIUS_RPC_URL, "confirmed");
  const publicKey = wallet.publicKey.toBase58();
  const decimals = await getTokenDecimals();
  const solAmount = BUYBACK_SOL_AMOUNT;

  console.log(`[AutoBuyback] Starting: ${solAmount} SOL → ${NOOP_MINT.slice(0, 8)}... (decimals: ${decimals})`);

  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
  const params = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: NOOP_MINT,
    amount: String(lamports),
    slippageBps: String(BUYBACK_SLIPPAGE_BPS),
  });

  const quoteRes = await fetch(`${JUPITER_API_BASE}/quote?${params}`);
  if (!quoteRes.ok) {
    const errText = await quoteRes.text();
    throw new Error(`Jupiter quote failed: ${errText}`);
  }
  const quoteResponse = await quoteRes.json();

  const outAmountRaw = parseInt(quoteResponse.outAmount || "0");
  const tokensReceived = outAmountRaw / Math.pow(10, decimals);
  console.log(`[AutoBuyback] Quote: ${solAmount} SOL → ${tokensReceived} tokens (raw: ${outAmountRaw})`);

  const swapRes = await fetch(`${JUPITER_API_BASE}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: publicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });

  if (!swapRes.ok) {
    const errText = await swapRes.text();
    throw new Error(`Jupiter swap failed: ${errText}`);
  }

  const swapData = await swapRes.json();
  const { swapTransaction } = swapData;
  if (!swapTransaction) throw new Error("No swap transaction returned from Jupiter");

  const txBuf = Buffer.from(swapTransaction, "base64");
  const transaction = VersionedTransaction.deserialize(txBuf);
  transaction.sign([wallet]);

  const rawTx = transaction.serialize();
  const buybackTxSig = await connection.sendRawTransaction(rawTx, {
    skipPreflight: false,
    maxRetries: 3,
  });

  console.log(`[AutoBuyback] Buyback tx sent: ${buybackTxSig}`);

  const confirmation = await connection.confirmTransaction(buybackTxSig, "confirmed");
  if (confirmation.value.err) {
    const errStr = JSON.stringify(confirmation.value.err);
    console.error(`[AutoBuyback] Buyback tx failed on-chain: ${errStr}`);

    await storage.insertBuyback({
      amountSol: solAmount,
      amountTokens: 0,
      txSignature: buybackTxSig,
      status: "failed",
    });

    return { success: false, solSpent: solAmount, tokensReceived: 0, tokensBurned: 0, buybackTx: buybackTxSig, error: errStr };
  }

  console.log(`[AutoBuyback] Buyback confirmed! ${solAmount} SOL → ${tokensReceived} tokens`);

  await storage.insertBuyback({
    amountSol: solAmount,
    amountTokens: tokensReceived,
    txSignature: buybackTxSig,
    status: "executed",
  });

  let burnTxSig: string | undefined;
  let tokensBurned = 0;

  try {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const mintPubkey = new PublicKey(NOOP_MINT);
    const ata = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey);
    const burnAmountRaw = BigInt(outAmountRaw);

    if (burnAmountRaw > BigInt(0)) {
      const ataInfo = await connection.getParsedAccountInfo(ata);
      const tokenAccountData = (ataInfo.value?.data as any)?.parsed?.info;
      const currentBalance = tokenAccountData?.tokenAmount?.amount
        ? BigInt(tokenAccountData.tokenAmount.amount)
        : BigInt(0);
      const amountToBurn = currentBalance < burnAmountRaw ? currentBalance : burnAmountRaw;

      if (amountToBurn > BigInt(0)) {
        const actualBurned = Number(amountToBurn) / Math.pow(10, decimals);
        console.log(`[AutoBuyback] Burning ${actualBurned} tokens (raw: ${amountToBurn})`);

        const burnIx = createBurnInstruction(ata, mintPubkey, wallet.publicKey, amountToBurn, [], TOKEN_PROGRAM_ID);
        const burnTx = new Transaction().add(burnIx);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        burnTx.recentBlockhash = blockhash;
        burnTx.feePayer = wallet.publicKey;
        burnTx.sign(wallet);

        burnTxSig = await connection.sendRawTransaction(burnTx.serialize(), { skipPreflight: false, maxRetries: 3 });
        console.log(`[AutoBuyback] Burn tx sent: ${burnTxSig}`);

        const burnConfirmation = await connection.confirmTransaction(
          { signature: burnTxSig, blockhash, lastValidBlockHeight },
          "confirmed"
        );

        if (burnConfirmation.value.err) {
          console.error(`[AutoBuyback] Burn tx failed: ${JSON.stringify(burnConfirmation.value.err)}`);
          await storage.insertBurn({ amountTokens: actualBurned, txSignature: burnTxSig, source: "buyback", status: "failed" });
        } else {
          tokensBurned = actualBurned;
          console.log(`[AutoBuyback] Burn confirmed! ${tokensBurned} tokens destroyed`);
          await storage.insertBurn({ amountTokens: tokensBurned, txSignature: burnTxSig, source: "buyback", status: "executed" });
        }
      } else {
        console.warn(`[AutoBuyback] No tokens available to burn, skipping`);
      }
    } else {
      console.warn(`[AutoBuyback] Zero tokens received, skipping burn`);
    }
  } catch (burnErr: any) {
    console.error(`[AutoBuyback] Burn failed: ${burnErr.message}`);
    await storage.insertBurn({ amountTokens: tokensReceived, txSignature: undefined, source: "buyback", status: "failed" });
  }

  return {
    success: true,
    buybackTx: buybackTxSig,
    burnTx: burnTxSig,
    solSpent: solAmount,
    tokensReceived,
    tokensBurned,
  };
}

function getRandomInterval(): number {
  return BUYBACK_INTERVAL_MIN_MS + Math.random() * (BUYBACK_INTERVAL_MAX_MS - BUYBACK_INTERVAL_MIN_MS);
}

async function autoBuybackLoop() {
  if (autoBuybackRunning) return;
  autoBuybackRunning = true;
  autoBuybackStats.isRunning = true;

  console.log(`[AutoBuyback] Starting automated buyback+burn loop (${BUYBACK_SOL_AMOUNT} SOL every 3-5 min)`);

  while (autoBuybackRunning) {
    try {
      const result = await executeBuybackAndBurn();

      if (result.success) {
        autoBuybackStats.totalExecuted++;
        autoBuybackStats.lastExecutedAt = new Date().toISOString();
        autoBuybackStats.lastError = null;
        console.log(`[AutoBuyback] Cycle complete: ${result.solSpent} SOL → ${result.tokensReceived} tokens bought, ${result.tokensBurned} burned`);
      } else {
        autoBuybackStats.totalFailed++;
        autoBuybackStats.lastError = result.error || "Unknown error";
        console.error(`[AutoBuyback] Cycle failed: ${result.error}`);
      }
    } catch (e: any) {
      autoBuybackStats.totalFailed++;
      autoBuybackStats.lastError = e.message;
      console.error(`[AutoBuyback] Cycle error: ${e.message}`);
    }

    const interval = getRandomInterval();
    const nextTime = new Date(Date.now() + interval);
    autoBuybackStats.nextScheduledAt = nextTime.toISOString();
    console.log(`[AutoBuyback] Next execution at ${nextTime.toISOString()} (${(interval / 1000 / 60).toFixed(1)} min)`);

    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

export function startAutoBuybackLoop() {
  if (!NOOP_MINT) {
    console.warn("[AutoBuyback] NOOP_MINT not set, auto-buyback disabled");
    return;
  }
  if (!process.env.WALLET_PRIVATE_KEY) {
    console.warn("[AutoBuyback] WALLET_PRIVATE_KEY not set, auto-buyback disabled");
    return;
  }

  autoBuybackLoop().catch(err => {
    console.error(`[AutoBuyback] Loop crashed: ${err.message}`);
    autoBuybackStats.isRunning = false;
    autoBuybackRunning = false;
  });
}

export function stopAutoBuyback() {
  autoBuybackRunning = false;
  autoBuybackStats.isRunning = false;
  autoBuybackStats.nextScheduledAt = null;
  console.log("[AutoBuyback] Stopped");
}
