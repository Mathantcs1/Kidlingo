# LinkedIn Post — TradePulse

---

🚀 **Excited to share TradePulse — a full-stack AI-powered trading journal I built from the ground up.**

After spending years watching traders lose their edge not because they lacked skill, but because they lacked data about themselves, I set out to build something different.

**TradePulse** is a professional-grade trading performance platform that turns raw trade data into actionable self-improvement — powered by AI, real-time market feeds, and deep analytics.

---

## 📊 What It Does (Business Value)

- **Diagnose your edge** — see exactly which strategies, sessions, instruments, and setups are profitable vs. bleeding capital
- **Plan before you trade** — pre-market trade plans with automatic price alerts so you never miss your entry
- **Real-time market scanning** — momentum breakouts, volume spikes, options flow, and gap scanners refreshed every 30 seconds
- **Unusual options activity** — detect institutional sweeps and block trades with IV rank analysis before the crowd notices
- **AI trade coach** — get a Claude (Anthropic) or GPT-4 powered analysis of every trade you take, identifying patterns in your psychology and execution
- **Multi-account support** — track performance across multiple brokers, strategies, or asset classes simultaneously
- **Team trading** — admin-controlled multi-user workspaces with role-based access (Admin / Trader / Viewer)

---

## ⚙️ Tech Stack (What's Under the Hood)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15** (App Router) | Server components, streaming, edge-ready |
| Language | **TypeScript** (strict) | Type safety across 30+ API routes |
| Database | **PostgreSQL + Prisma ORM** on Neon | Serverless-native, instant connection pooling |
| Auth | **NextAuth v5** (JWT + PrismaAdapter) | Credentials + Google OAuth, role-based guards |
| AI | **Anthropic Claude + OpenAI GPT-4** | User-selectable; streaming SSE chat |
| Styling | **Tailwind CSS + shadcn/ui** | Consistent design system, dark/light themes |
| Charts | **Recharts** | Equity curve, heatmaps, donut charts |
| Candlesticks | **Custom SVG renderer** | Pure SVG, no canvas — works on any device |
| File Storage | **UploadThing** | Screenshot attachments on trades |
| Market Data | **Yahoo Finance v8 + Twelve Data** | Free-tier live prices, RSI, OHLCV |
| Deployment | **Vercel** | Zero-config, edge middleware, preview URLs |

---

## 🏗️ Architecture Highlights

**11 Prisma models** covering Users, Trades (equities + options), Trade Plans, Price Alerts, AI Analyses, Trading Accounts, Subscriptions, Custom Dropdown Values, and Trading Groups.

**Subscription tiers (FREE / BASIC / PRO)** enforced server-side on every API route — not just the UI. Limits on trades/month, AI analyses, CSV exports, and trading groups are checked in middleware before any DB write.

**Real-time price alerts** poll Yahoo Finance every 30 seconds. When a price crosses your entry, stop, or target — you get an in-app toast notification instantly. No WebSocket infra needed for V1.

**AI analysis caching** — each trade's Claude/GPT analysis is stored in the DB after first generation. Subsequent views load instantly from cache, keeping API costs predictable.

**Market scanners** run parallel fetches across 15-symbol watchlists using Yahoo Finance's v8 chart endpoint (no session crumb required from server environments — a non-obvious constraint that trips up most implementations). Twelve Data handles RSI with a 1-hour cache to stay within free-tier credit limits.

**Role-based middleware** checks every `/dashboard/*` and `/admin/*` route at the edge before rendering — unauthenticated users hit the login redirect before any server component runs.

**Options trading support** — full CALL/PUT tracking with strike, expiry, contracts, underlying price, and automatic premium calculation. The Unusual Trades scanner surfaces high IV-rank anomalies with vol/OI ratios and estimated institutional flow classification (Sweep vs Block).

---

## 📈 Key Metrics Dashboard

Every session shows:
- Net P&L with equity curve (area chart with gradient fill)
- Win rate, profit factor, average R-multiple
- Max drawdown
- Calendar heatmap (green/red days)
- Instrument allocation donut
- Best and worst trades ranked

Reports break down performance by instrument, strategy, day of week, and trading hour — helping you find the "golden hours" where your edge is strongest.

---

## 🔐 Security Approach

- Passwords hashed with bcrypt (10 rounds)
- JWT tokens signed with `AUTH_SECRET`, never exposed to client
- All API routes validate session via `auth()` before any DB query
- Role checks on both the middleware layer (edge) and API route layer (server)
- Viewer roles cannot call write endpoints even with direct API access
- No sensitive keys in client bundles

---

## 💡 What I Learned Building This

1. **Yahoo Finance v7 batch API silently fails from cloud IPs** (returns 200 with empty results) — the v8 per-symbol chart endpoint bypasses this entirely
2. **Free-tier credit budgeting matters** — with 800 Twelve Data credits/day, caching RSI at 1-hour intervals is the difference between live data and hitting the wall at noon
3. **CSS variables don't work in SVG presentation attributes** — `stroke="hsl(var(--border))"` renders nothing; you must resolve via `getComputedStyle` at mount
4. **Next.js `revalidate` in Route Handlers** caches at the deployment level, not per-request — so 1000 concurrent users don't generate 1000 upstream API calls
5. **Streaming AI responses** require careful handling of SSE backpressure on Vercel's serverless environment — connection timeouts need explicit `keep-alive` pings

---

## 🔭 What's Next

- WebSocket-based alert delivery (replacing the 30s poll)
- Stripe integration for subscription billing
- Mobile app (React Native, sharing the same API layer)
- Broker API integrations (IBKR, Alpaca) for automatic trade import
- AI-generated weekly performance reports delivered by email

---

**Built with:** Next.js · TypeScript · Prisma · Neon · NextAuth · Anthropic Claude · OpenAI · Tailwind · Recharts · Vercel

If you're a trader or building tools for traders — I'd love to connect and hear your thoughts. Drop a comment or DM me.

**#Trading #FinTech #NextJS #TypeScript #AI #OpenAI #Claude #Anthropic #WebDevelopment #SaaS #TradingJournal #FullStack #Vercel #PostgreSQL #TradePulse**

---

*Live at: https://tradepulse.vercel.app*
