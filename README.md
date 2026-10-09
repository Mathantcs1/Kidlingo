# Fairshare

A Splitwise-style app for splitting shared expenses — rebuilt to remove Splitwise's biggest pain points.
Built with React + TypeScript + Vite. Runs entirely in the browser, installable as a PWA, works offline.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for all money / split / balance logic
npm run build    # production build in dist/ (static — host anywhere)
```

## Splitwise drawbacks → what Fairshare does instead

| Splitwise pain point | Fairshare |
| --- | --- |
| Free tier limits how many expenses you can add per day, plus a cooldown timer | **Unlimited** expenses, no timers, no paywall |
| Ads in the free app | **No ads, no tracking** |
| Everyone needs an account / email / phone | **No accounts.** Members are just names |
| Needs internet; slow to sync | **Offline-first** PWA; data stored on the device |
| Itemized receipt splitting, charts, search, currency conversion are Pro-only | **All free**: itemized split, charts, search & filters, multi-currency |
| Exchange-rate changes silently shift old balances | Each expense **freezes its own exchange rate** |
| "Extra cent" always lands on the same person; rounding drift | Integer minor units + largest-remainder rounding; the leftover cent **rotates**; every balance sums to exactly 0 (unit-tested) |
| "Simplify debts" is a black box | Toggle with an explanation (“3 payments instead of 5”) and a non-simplified who-owes-whom view |
| Deleted expenses are gone | **Undo** toast + **Recently deleted** trash with restore |
| Hard to get your data out | **CSV export**, full **JSON backup/restore**, print/PDF |
| No budgets | **Monthly group budget** with progress meter |
| Reminders are generic | One-tap **reminders** via share sheet / clipboard, with a **UPI pay link** when the recipient has a UPI ID |
| Privacy: all your finances on someone else's server | Data never leaves your device unless *you* share a link |

## Features

- Groups with emoji, base currency, archive, and "which member is me" for *you owe / you are owed* views
- Split modes: **equal**, **exact amounts**, **percent**, **shares**, **adjustments (+/−)**, **itemized** (tax/tip spread proportionally)
- **Multiple payers** per expense
- **Calculator** in every amount field (`1200/3+50`)
- **Auto-category** from the description (“Uber” → Transport)
- **Recurring** expenses (weekly / monthly / yearly; month-end safe)
- Partial or full **settle-up** payments, recorded in the ledger
- **Insights**: totals, this month, by category, by month, per-person share
- **Share / sync links**: the whole group is compressed into the URL fragment (never sent to a server). Opening a link on another device imports it, or **merges** changes (last edit wins per expense, deletions included)
- Duplicate expense, notes, edit history timestamps
- Light / dark / system theme, mobile bottom-sheet layout, keyboard accessible, multi-tab sync

## Project layout

```
src/core/      pure logic, no React — fully unit-tested (core.test.ts)
  money.ts       minor units, parsing, formatting, allocate() (exact proportional rounding), FX convert
  split.ts       computeShares() for every split mode, payer validation
  balances.ts    net balances, simplifyDebts(), pairwiseDebts(), member stats
  recurring.ts   recurring expense generation
  insights.ts    analytics
  io.ts          localStorage persistence, backup validation, CSV, share-link encode/decode
  expr.ts        safe calculator (no eval)
src/state/     React context + reducer store (persists to localStorage)
src/components/ UI: Home, GroupView (expenses/balances/insights/settings), ExpenseForm, SettleForm
public/        PWA manifest, icon, service worker
```
