export interface XAlert {
  id: string;
  username: string;
  displayName: string;
  followers: number;
  tweetText: string;
  tweetUrl: string;
  detectedAt: string;
  tokenMint: string;
  tokenSymbol: string;
}

interface MonitoredToken {
  mint: string;
  symbol: string;
  twitterHandle: string | null;
}

const alerts: XAlert[] = [];
let monitoredToken: MonitoredToken | null = null;
let monitorInterval: ReturnType<typeof setInterval> | null = null;
const BEARER_TOKEN = () => process.env.X_BEARER_TOKEN || "";

export function getAlerts(mint?: string): XAlert[] {
  if (mint) return alerts.filter(a => a.tokenMint === mint);
  return [...alerts];
}

export function clearAlerts(mint?: string) {
  if (mint) {
    let idx: number;
    while ((idx = alerts.findIndex(a => a.tokenMint === mint)) >= 0) {
      alerts.splice(idx, 1);
    }
  } else {
    alerts.length = 0;
  }
}

export function startMonitoring(token: MonitoredToken) {
  monitoredToken = token;

  if (monitorInterval) {
    clearInterval(monitorInterval);
  }

  console.log(`[X Monitor] Started monitoring for $${token.symbol} (${token.mint.slice(0, 8)}...)`);

  checkForMentions();
  monitorInterval = setInterval(checkForMentions, 60000);
}

export function stopMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  monitoredToken = null;
  console.log("[X Monitor] Stopped monitoring");
}

export function getMonitorStatus(): { active: boolean; token: MonitoredToken | null; alertCount: number } {
  return {
    active: !!monitorInterval && !!monitoredToken,
    token: monitoredToken,
    alertCount: alerts.length,
  };
}

async function checkForMentions() {
  if (!monitoredToken) return;

  const bearer = BEARER_TOKEN();
  if (!bearer) {
    console.log("[X Monitor] No X_BEARER_TOKEN set — running in simulation mode");
    return;
  }

  const { mint, symbol } = monitoredToken;

  const queries = [
    symbol,
    `$${symbol}`,
    mint.slice(0, 12),
  ];

  for (const query of queries) {
    try {
      const searchUrl = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=10&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=username,name,public_metrics`;

      const res = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${bearer}`,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        if (res.status === 429) {
          console.log("[X Monitor] Rate limited, will retry next cycle");
          return;
        }
        console.error(`[X Monitor] API error: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const tweets = data.data || [];
      const users = data.includes?.users || [];

      const userMap: Record<string, any> = {};
      for (const u of users) {
        userMap[u.id] = u;
      }

      for (const tweet of tweets) {
        const author = userMap[tweet.author_id];
        if (!author) continue;

        const followers = author.public_metrics?.followers_count || 0;
        if (followers < 10000) continue;

        const existingAlert = alerts.find(a => a.tweetUrl.includes(tweet.id));
        if (existingAlert) continue;

        const alert: XAlert = {
          id: `${Date.now()}-${tweet.id}`,
          username: author.username,
          displayName: author.name,
          followers,
          tweetText: tweet.text,
          tweetUrl: `https://x.com/${author.username}/status/${tweet.id}`,
          detectedAt: new Date().toISOString(),
          tokenMint: mint,
          tokenSymbol: symbol,
        };

        alerts.unshift(alert);
        console.log(`[X ALERT] Influencer @${author.username} (${followers.toLocaleString()} followers) mentioned $${symbol}!`);

        if (alerts.length > 50) alerts.length = 50;
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("[X Monitor] Fetch error:", e.message);
      }
    }
  }
}
