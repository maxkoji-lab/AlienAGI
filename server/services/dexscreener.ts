const DEX_BASE = "https://api.dexscreener.com";

export interface TokenProfile {
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
  twitterUrl: string | null;
  telegramUrl: string | null;
  discordUrl: string | null;
  dexscreenerUrl: string | null;
}

export async function fetchTokenProfile(mint: string): Promise<TokenProfile | null> {
  try {
    const res = await fetch(`${DEX_BASE}/latest/dex/tokens/${mint}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();

    if (!data.pairs || data.pairs.length === 0) return null;

    const pair = data.pairs[0];
    const info = pair.info || {};
    const websites: { url: string; label?: string }[] = info.websites || [];
    const socials: { url: string; type: string }[] = info.socials || [];

    const twitterSocial = socials.find((s: any) => s.type === "twitter");
    const telegramSocial = socials.find((s: any) => s.type === "telegram");
    const discordSocial = socials.find((s: any) => s.type === "discord");

    let twitterHandle: string | null = null;
    if (twitterSocial) {
      const match = twitterSocial.url.match(/(?:twitter\.com|x\.com)\/(@?[A-Za-z0-9_]{1,15})(?:\/|$|\?)/);
      const invalidPaths = ["i", "search", "explore", "home", "settings", "messages", "notifications", "hashtag"];
      if (match && !invalidPaths.includes(match[1].replace("@", "").toLowerCase())) {
        twitterHandle = match[1].startsWith("@") ? match[1] : `@${match[1]}`;
      }
    }

    let description = "";
    try {
      const profileRes = await fetch(`${DEX_BASE}/token-profiles/latest/v1`, {
        signal: AbortSignal.timeout(8000),
      });
      if (profileRes.ok) {
        const profiles = await profileRes.json();
        const match = profiles.find((p: any) =>
          p.tokenAddress?.toLowerCase() === mint.toLowerCase()
        );
        if (match?.description) {
          description = match.description;
        }
      }
    } catch {
    }

    return {
      name: pair.baseToken?.name || "Unknown",
      symbol: pair.baseToken?.symbol || "???",
      description,
      imageUrl: info.imageUrl || null,
      priceUsd: pair.priceUsd || null,
      marketCap: pair.marketCap || null,
      fdv: pair.fdv || null,
      volume24h: pair.volume?.h24 || null,
      websites,
      socials,
      twitterHandle,
      twitterUrl: twitterHandle
        ? `https://x.com/${twitterHandle.replace("@", "")}`
        : `https://x.com/search?q=${encodeURIComponent(mint)}`,
      telegramUrl: telegramSocial?.url || null,
      discordUrl: discordSocial?.url || null,
      dexscreenerUrl: pair.url || null,
    };
  } catch (e) {
    console.error("DexScreener fetch error:", e);
    return null;
  }
}
