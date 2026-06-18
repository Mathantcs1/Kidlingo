# TradePulse — User Manual

TradePulse is a trading journal and analytics platform that helps traders log trades, plan entries, track performance, and get AI-assisted feedback on their trading habits.

This manual covers every feature available in the app. It does not include any API keys, secrets, or credentials — only how to use the product.

---

## 1. Getting Started

### 1.1 Creating an Account
1. Go to the TradePulse login page.
2. Click **Sign up**.
3. Enter your name, email, and a password (minimum 8 characters).
4. Submit the form — you'll be redirected to the Dashboard.

### 1.2 Signing In
You can sign in two ways:
- **Email & password** — enter your registered credentials.
- **Sign in with Google** — one-click sign-in using your Google account. New Google sign-ins automatically get a free plan and default journal categories set up for them.

### 1.3 First-Time Setup
On signup, TradePulse automatically seeds your account with default:
- Strategy tags (e.g., Breakout, Reversal, Swing)
- Instruments
- Psychology tags
- Trade setups
- Session types

These can all be customized later in **Settings**.

---

## 2. Dashboard

The Dashboard is your home screen, showing:
- Key performance metrics (win rate, total P&L, average R-multiple, etc.)
- Recent trades
- Equity curve / performance chart
- Quick links to add a new trade or trade plan

---

## 3. Trades

### 3.1 Viewing Trades
The **Trades** page lists all your logged trades with filters for:
- Instrument
- Direction (Long/Short)
- Strategy tag
- Date range
- Status (Open/Closed)

You can sort by entry date, P&L, R-multiple, or instrument.

### 3.2 Adding a Trade
Click **Add Trade** and fill in the form:

**Required fields:**
- Instrument (ticker symbol)
- Direction (Long/Short)
- Entry Price
- Quantity
- Entry Date

**Optional fields** (leave blank if not applicable yet, e.g. for an open trade):
- Exit Price / Exit Date
- Stop Loss / Take Profit
- Commission
- Strategy Tag, Session Type, Trade Setup
- Notes and Psychology notes
- Screenshot URL

For options trades, switch **Trade Type** to "Options" to reveal additional fields: option type (Call/Put), strike price, expiration date, number of contracts, and underlying price.

> Tip: You only need to fill in Entry Price, Quantity, Direction, Instrument, and Entry Date to save a trade. All other fields can be added later when you close the position.

### 3.3 Editing / Closing a Trade
Open any trade and click **Edit** to add exit details (price, date) once the position is closed. P&L and R-multiple are calculated automatically.

### 3.4 Trade Groups & Trading Accounts
Trades can be tagged to a **Trading Account** (e.g., separate accounts you trade with) and grouped together for combined analysis. Trading groups are available on Basic and Pro plans.

---

## 4. Trade Plans

Trade Plans let you pre-define a setup before you enter a trade.

1. Go to **Trade Plans → New Plan**.
2. Enter the date, instrument, direction, planned entry price, stop loss, and take profit.
3. Add a rationale for the trade (optional).
4. Enable **Alerts** if you want to be notified when the price hits your entry, stop, or target.

Plans can later be converted into actual trades once executed.

---

## 5. Price Alerts

The **Alerts** page shows all active and triggered price alerts. Alerts can be created manually or generated automatically from a Trade Plan. Alert types include:
- Entry Hit
- Exit Hit
- Stop Hit
- Price Above / Price Below a target

Alerts are checked periodically while you have the app open and will notify you when triggered.

---

## 6. Market Scanners

The **Scanners** page surfaces real-time market data pulled from live financial data providers (with prices delayed up to 15 minutes on the free data tier). Available scanner views include:
- Top Gainers / Losers
- Most Active by volume
- Sector performance
- RSI-based momentum scans

Use this to find candidate setups before placing a trade.

---

## 7. Unusual Trades

The **Unusual Trades** page highlights unusual options activity (large or abnormal options volume relative to open interest) for popular tickers, sourced from live options chain data.

---

## 8. Reports

The **Reports** page provides deeper analytics:
- Win rate and profit factor over time
- Performance broken down by strategy tag, instrument, session type, and day of week
- R-multiple distribution
- Equity curve

Use Reports to identify which strategies and conditions are working best for you.

CSV export of trade data is available on Basic and Pro plans.

---

## 9. AI Assistant

The **AI Assistant** page lets you ask questions about your trading performance and get AI-generated insights (e.g., "What's my biggest weakness this month?"). You can choose between supported AI providers in **Settings**.

AI analysis usage is limited per month depending on your subscription plan (see Section 12).

---

## 10. Trading Accounts

Manage multiple trading accounts (e.g., a live account and a paper/demo account) under **Accounts**. Each trade can be associated with an account so you can track performance per account separately.

---

## 11. Settings

In **Settings** you can:
- Update your display name
- Choose your preferred AI provider
- Manage custom dropdown values (strategy tags, instruments, psychology tags, trade setups, session types) used throughout the app

---

## 12. Subscription Plans

TradePulse offers three plans:

| Feature | Free | Basic | Pro |
|---|---|---|---|
| Trades per month | 20 | 200 | Unlimited |
| AI analyses per month | 5 | 50 | Unlimited |
| Trade plans per month | 5 | 50 | Unlimited |
| Trading groups | 0 | 1 | Unlimited |
| CSV export | No | Yes | Yes |

Your current plan and usage are visible in your account settings. Admins can manage user subscriptions from the Admin Panel (see below).

---

## 13. Admin Panel (Admin role only)

Users with the Admin role have access to an **Admin Panel** with:
- **Users** — view and manage all registered users and their roles
- **Groups** — manage trading groups across the platform
- **Subscriptions** — manually update a user's plan, status, or trial/expiry dates

---

## 14. Account & Security Notes

- Passwords are securely hashed and never stored in plain text.
- Google sign-in uses OAuth — TradePulse never sees or stores your Google password.
- All trade data is private to your account; only Admins can view aggregate user/subscription information, never individual trade details of other users.

---

## 15. Troubleshooting

**I can't sign in with Google.**
This usually means Google sign-in isn't configured yet for this deployment, or your account isn't on the allow-list during testing mode. Contact your administrator.

**My trade won't save even though I filled in the required fields.**
Make sure Entry Price, Quantity, Instrument, Direction, and Entry Date are filled in. All other fields are optional and can be left blank.

**Scanner/Unusual Trades data looks delayed.**
Live market data on the free tier is delayed by up to 15 minutes — this is expected behavior, not a bug.

**I hit my monthly limit for trades, AI analyses, or trade plans.**
Upgrade your plan in Settings, or wait until the next calendar month when usage limits reset.

---

*This manual covers the core functionality of TradePulse. No API keys, credentials, or environment configuration values are included in this document.*
