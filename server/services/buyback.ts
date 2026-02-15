import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js";
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

let cachedTokenDecimals: number | null = null;

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

export function verifyBuybackAuth(providedKey: string | undefined): boolean {
  const walletPk = process.env.WALLET_PRIVATE_KEY;
  if (!walletPk || !providedKey) return false;

  try {
    const wallet = loadWallet();
    const expectedPubkey = wallet.publicKey.toBase58();
    return providedKey === expectedPubkey;
  } catch {
    return false;
  }
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

export async function getBuybackQuote(solAmount: number, slippageBps: number = 100) {
  if (!NOOP_MINT) throw new Error("NOOP_MINT not configured");
  if (solAmount <= 0) throw new Error("SOL amount must be positive");

  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
  const params = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: NOOP_MINT,
    amount: String(lamports),
    slippageBps: String(slippageBps),
  });

  const res = await fetch(`${JUPITER_API_BASE}/quote?${params}`);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Jupiter quote failed: ${errText}`);
  }
  const quoteData = await res.json();

  const decimals = await getTokenDecimals();
  const outAmountRaw = parseInt(quoteData.outAmount || "0");
  const outAmountFormatted = outAmountRaw / Math.pow(10, decimals);

  return { ...quoteData, _decimals: decimals, _outAmountFormatted: outAmountFormatted };
}

let lastBuybackTime = 0;
const BUYBACK_COOLDOWN_MS = 10_000;

export async function executeBuyback(solAmount: number, slippageBps: number = 100): Promise<{
  success: boolean;
  txSignature?: string;
  solSpent: number;
  tokensReceived: number;
  error?: string;
}> {
  if (!NOOP_MINT) throw new Error("NOOP_MINT not configured");
  if (!process.env.WALLET_PRIVATE_KEY) throw new Error("WALLET_PRIVATE_KEY not set");

  const now = Date.now();
  if (now - lastBuybackTime < BUYBACK_COOLDOWN_MS) {
    throw new Error("Buyback cooldown active. Please wait 10 seconds between buybacks.");
  }
  lastBuybackTime = now;

  const wallet = loadWallet();
  const connection = new Connection(HELIUS_RPC_URL, "confirmed");
  const publicKey = wallet.publicKey.toBase58();
  const decimals = await getTokenDecimals();

  console.log(`[Buyback] Starting: ${solAmount} SOL → ${NOOP_MINT.slice(0, 8)}... (decimals: ${decimals})`);

  const quoteResponse = await getBuybackQuote(solAmount, slippageBps);
  const outAmountRaw = parseInt(quoteResponse.outAmount || "0");
  const tokensReceived = outAmountRaw / Math.pow(10, decimals);
  console.log(`[Buyback] Quote: ${solAmount} SOL → ${tokensReceived} tokens (raw: ${outAmountRaw})`);

  const { _decimals, _outAmountFormatted, ...cleanQuote } = quoteResponse;

  const swapRes = await fetch(`${JUPITER_API_BASE}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: cleanQuote,
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
  const txSignature = await connection.sendRawTransaction(rawTx, {
    skipPreflight: false,
    maxRetries: 3,
  });

  console.log(`[Buyback] Sent tx: ${txSignature}`);

  const confirmation = await connection.confirmTransaction(txSignature, "confirmed");
  if (confirmation.value.err) {
    const errStr = JSON.stringify(confirmation.value.err);
    console.error(`[Buyback] Transaction failed on-chain: ${errStr}`);

    await storage.insertBuyback({
      amountSol: solAmount,
      amountTokens: 0,
      txSignature,
      status: "failed",
    });

    return { success: false, solSpent: solAmount, tokensReceived: 0, txSignature, error: errStr };
  }

  console.log(`[Buyback] Confirmed! ${solAmount} SOL → ${tokensReceived} tokens. Tx: ${txSignature}`);

  await storage.insertBuyback({
    amountSol: solAmount,
    amountTokens: tokensReceived,
    txSignature,
    status: "executed",
  });

  return { success: true, txSignature, solSpent: solAmount, tokensReceived };
}
