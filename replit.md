# PippinAGI

## Overview
PippinAGI is a fullstack Solana token metrics tracking application with an integrated AI agent (BabyAGI 3). It monitors token holder counts, whale net flows, and calculates a Network Conviction Index (NCI). The system generates daily operator briefs and displays real-time metrics in a cyberpunk-themed terminal dashboard.

## Recent Changes
- 2026-02-13: Added private key input for auto-signing trades without Phantom popup — supports base58 and JSON array formats, client-side only
- 2026-02-13: Fixed Jupiter API: switched to public.jupiterapi.com (quote-api.jup.ag DNS blocked from server), added GET handler for quote endpoint
- 2026-02-13: Added NCI-powered auto-trading bot (A.L.I.E.N section) — Phantom wallet connect or private key, NCI-based BUY/SELL/HOLD signals, configurable thresholds/slippage, trade history tracking, manual and auto trade modes, PnL display (realized P&L, spent/received SOL, token holdings)
- 2026-02-13: Removed burn tracker section from dashboard (user requested removal)
- 2026-02-12: Added DexScreener token profile integration — fetches name, ticker, description/lore, social links, price, market cap from DexScreener API (no key required)
- 2026-02-12: Added X/Twitter influencer monitoring loop — background service checks for mentions from accounts with >10k followers, stores alerts (requires X_BEARER_TOKEN)
- 2026-02-12: Token Scanner now shows full token profile card with logo, links, and lore from DexScreener
- 2026-02-12: Added Token Scanner — users can input any Solana contract address to get holder analysis, whale concentration, NCI score, and optional BabyAGI-3 AI analysis
- 2026-02-12: Added Treasury system (buybacks, burns, reward campaigns) with full CRUD API and cyberpunk-themed Treasury page
- 2026-02-12: Renamed project from "NoopCoin" to "PippinAGI" across all components
- 2026-02-12: Imported BabyAGI 3 AI agent framework from GitHub (yoheinakajima/babyagi3)
- 2026-02-12: Configured BabyAGI 3 to use port 3001 to avoid conflict with dashboard on port 5000

## Project Architecture

### Frontend (Port 5000)
- **Stack:** React + Vite + TypeScript + TailwindCSS + shadcn/ui
- **Theme:** Cyberpunk terminal aesthetic with neon green/cyan accents
- **Key Pages:**
  - `client/src/pages/Dashboard.tsx` - Main metrics dashboard
  - `client/src/pages/Treasury.tsx` - Treasury operations (buybacks, burns, rewards)
- **Key Components:**
  - `client/src/components/BriefTerminal.tsx` - Operator brief display
  - `client/src/components/NciChart.tsx` - NCI chart visualization
  - `client/src/components/AutoTrader.tsx` - NCI-powered auto-trading bot with Phantom wallet
  - `client/src/components/WalletProvider.tsx` - Solana wallet adapter provider (Phantom)
- **Key Hooks:**
  - `client/src/hooks/use-treasury.ts` - Treasury data queries and mutations

### Backend (Port 5000 - same Express server)
- **Stack:** Express + TypeScript + Drizzle ORM + PostgreSQL
- **Key Files:**
  - `server/routes.ts` - API routes
  - `server/storage.ts` - Database storage interface
  - `server/services/operator.ts` - Helius RPC integration, NCI calculation, operator loop
  - `server/services/dexscreener.ts` - DexScreener API integration for token metadata (no key required)
  - `server/services/xmonitor.ts` - X/Twitter influencer monitoring loop and alert system
  - `shared/schema.ts` - Database schema and types

### BabyAGI 3 Agent (babyagi3/ directory, Port 3001)
- **Stack:** Python 3.11 + FastAPI + LiteLLM + Anthropic/OpenAI
- **Entry Point:** `babyagi3/main.py`
- **Server:** `babyagi3/server.py` (FastAPI on port 3001)
- **Config:** `babyagi3/config.yaml`
- **Modes:** CLI, serve (API only), channels (listeners), all (combined)
- **Run:** `cd babyagi3 && python main.py` (requires ANTHROPIC_API_KEY or OPENAI_API_KEY)

### Environment Variables / Secrets
- `HELIUS_API_KEY` - Helius RPC API key for Solana data
- `NOOP_MINT` - Token mint address (set to actual address when live)
- `SESSION_SECRET` - Express session secret
- `DATABASE_URL` - PostgreSQL connection (auto-configured)
- BabyAGI 3 uses its own config via `babyagi3/config.yaml` and env vars

### Workflows
- **Start application:** `npm run dev` - Runs the Express + Vite dashboard on port 5000
- BabyAGI 3 runs separately via `cd babyagi3 && python main.py`

## User Preferences
- Cyberpunk/terminal aesthetic with dark theme
- Use Helius API (not manual Solana RPC) for data
- Project branded as "PippinAGI"
