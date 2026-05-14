"use client";
import { useState } from "react";
import { HelpCircle, LayoutDashboard, LineChart, CalendarCheck, BarChart2, BrainCircuit, Bell, Settings, ShieldCheck, ChevronRight, BookOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface HelpSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  content: React.ReactNode;
}

const sections: HelpSection[] = [
  {
    id: "start",
    label: "Getting Started",
    icon: BookOpen,
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Welcome to TradePulse — your all-in-one trading performance tracker.</p>
        <HelpBlock title="Roles">
          <HelpRow label="Trader" desc="Full access: create, edit, and delete trades, plans, and alerts." />
          <HelpRow label="Viewer" desc="Read-only access. Can view dashboard and reports but cannot create or modify data." />
          <HelpRow label="Admin" desc="Full trader access plus user management, subscription control, and group administration." />
        </HelpBlock>
        <HelpBlock title="Quick-start steps">
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
            <li>Register or log in with email/password or Google.</li>
            <li>Go to <strong className="text-foreground">Trades → New Trade</strong> to log your first trade.</li>
            <li>Check <strong className="text-foreground">Dashboard</strong> for live stats after a few trades.</li>
            <li>Use <strong className="text-foreground">AI Assistant</strong> to get analysis on your performance.</li>
          </ol>
        </HelpBlock>
        <HelpBlock title="Theme">
          <p className="text-sm text-muted-foreground">Click the sun/moon icon in the top-right header to toggle dark/light mode.</p>
        </HelpBlock>
      </div>
    ),
  },
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">The dashboard gives you a real-time snapshot of your trading performance.</p>
        <HelpBlock title="Stat cards">
          <HelpRow label="Total P&L" desc="Sum of all closed trade profits and losses." />
          <HelpRow label="Win Rate" desc="Percentage of closed trades that were profitable." />
          <HelpRow label="Avg R-Multiple" desc="Average risk-reward ratio across closed trades. >1.0 is healthy." />
          <HelpRow label="Profit Factor" desc="Gross profit ÷ gross loss. >1.5 is generally good." />
          <HelpRow label="Max Drawdown" desc="Largest peak-to-trough decline in your equity curve." />
        </HelpBlock>
        <HelpBlock title="Charts">
          <HelpRow label="Equity Curve" desc="Running account balance over time. Look for a smooth upward trend." />
          <HelpRow label="Daily P&L" desc="Bar chart of profit/loss per trading day." />
          <HelpRow label="Calendar Heatmap" desc="Green/red grid showing daily P&L at a glance for the month." />
          <HelpRow label="Instrument Donut" desc="Breakdown of trade count by instrument." />
        </HelpBlock>
      </div>
    ),
  },
  {
    id: "trades",
    label: "Trades",
    icon: LineChart,
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Log and manage every trade with full detail, including screenshots and notes.</p>
        <HelpBlock title="Creating a trade">
          <HelpRow label="Instrument" desc="Type any ticker (e.g. AAPL, SPY). Autocomplete fetches live market data and shows a price/info panel." />
          <HelpRow label="Trade Type" desc="Choose Equity for stocks/ETFs or Options for calls/puts." />
          <HelpRow label="Direction" desc="LONG if you bought expecting price to rise; SHORT if you sold/shorted." />
          <HelpRow label="Entry / Exit" desc="Leaving exit blank marks the trade as OPEN. Fill in exit price + date to close it." />
          <HelpRow label="P&L Preview" desc="The form calculates estimated P&L and R-Multiple live as you type." />
        </HelpBlock>
        <HelpBlock title="Options fields (visible when Trade Type = Options)">
          <HelpRow label="Call / Put" desc="The option contract type." />
          <HelpRow label="Strike Price" desc="The contract's strike." />
          <HelpRow label="# Contracts" desc="Number of contracts (quantity auto-sets to n × 100 shares)." />
          <HelpRow label="Expiration" desc="Contract expiration date." />
        </HelpBlock>
        <HelpBlock title="Other fields">
          <HelpRow label="Stop Loss / Take Profit" desc="Used to calculate R-Multiple (risk-reward ratio)." />
          <HelpRow label="Commission" desc="Deducted from P&L automatically." />
          <HelpRow label="Strategy / Setup / Session" desc="Tag trades for filtering and reporting." />
          <HelpRow label="Psychology" desc="Free-text notes on your mental state — used by AI analysis." />
          <HelpRow label="Screenshot" desc="Upload a chart screenshot via the screenshot uploader." />
        </HelpBlock>
        <HelpBlock title="Filtering & sorting">
          <p className="text-sm text-muted-foreground">Use the filter bar on the Trades list to narrow by instrument, direction, strategy, date range, or status. Click column headers to sort.</p>
        </HelpBlock>
      </div>
    ),
  },
  {
    id: "plans",
    label: "Trade Plans",
    icon: CalendarCheck,
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Plan your trades before the market opens. Plans track whether your setups triggered and allow you to convert a plan directly into a trade.</p>
        <HelpBlock title="Plan fields">
          <HelpRow label="Instrument + Direction" desc="What you plan to trade and which way." />
          <HelpRow label="Entry / Stop Loss / Take Profit" desc="Key price levels. R:R is calculated and shown live." />
          <HelpRow label="Rationale" desc="Write your thesis — this feeds into AI analysis later." />
          <HelpRow label="Alerts Enabled" desc="When on, price alerts are auto-created for entry, SL, and TP levels." />
        </HelpBlock>
        <HelpBlock title="Plan statuses">
          <HelpRow label="Pending" desc="Setup not yet triggered." />
          <HelpRow label="Triggered" desc="Entry price was hit." />
          <HelpRow label="Expired" desc="Plan date passed without triggering." />
          <HelpRow label="Cancelled" desc="Manually cancelled." />
        </HelpBlock>
        <HelpBlock title="Convert to Trade">
          <p className="text-sm text-muted-foreground">Open any plan and click <strong className="text-foreground">Convert to Trade</strong>. The trade form pre-fills with the plan's instrument, direction, and prices so you only need to add the actual execution details.</p>
        </HelpBlock>
      </div>
    ),
  },
  {
    id: "reports",
    label: "Reports",
    icon: BarChart2,
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Deep-dive analytics across five report tabs to uncover strengths and weaknesses.</p>
        <HelpBlock title="Report tabs">
          <HelpRow label="By Instrument" desc="Win rate, P&L, and trade count grouped by ticker. Spot your best and worst instruments." />
          <HelpRow label="By Strategy" desc="Performance broken down by your strategy tags. Shows which strategies are working." />
          <HelpRow label="By Time" desc="Hour-of-day × day-of-week heatmap. Reveals when you trade best and worst." />
          <HelpRow label="Streak Analysis" desc="Win/loss streaks, max consecutive wins and losses, longest flat periods." />
          <HelpRow label="Risk Metrics" desc="Sharpe ratio, Sortino ratio, profit factor, average win vs average loss, and more." />
        </HelpBlock>
        <HelpBlock title="CSV Export">
          <p className="text-sm text-muted-foreground">Click <strong className="text-foreground">Export CSV</strong> in Reports to download all your closed trades as a spreadsheet. Requires BASIC or PRO plan.</p>
        </HelpBlock>
      </div>
    ),
  },
  {
    id: "ai",
    label: "AI Assistant",
    icon: BrainCircuit,
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Use AI to analyse individual trades, generate portfolio summaries, and chat about your performance.</p>
        <HelpBlock title="Features">
          <HelpRow label="Trade Analysis" desc="Open any trade → click Analyse with AI. Gets pattern recognition, risk assessment, psychology observations, and 3 improvement suggestions." />
          <HelpRow label="Weekly / Monthly Summary" desc="On the AI page, click Generate Summary to get a narrative overview of your recent performance with action items." />
          <HelpRow label="Chat" desc="Ask the AI anything about your trading. It has context of your recent stats and trade history." />
        </HelpBlock>
        <HelpBlock title="AI Provider">
          <HelpRow label="Claude (Anthropic)" desc="Default. Uses claude-opus-4-5 model." />
          <HelpRow label="GPT-4 (OpenAI)" desc="Alternative. Uses gpt-4o model. Switch in Settings → AI Provider." />
        </HelpBlock>
        <HelpBlock title="Your own API key">
          <p className="text-sm text-muted-foreground">Go to <strong className="text-foreground">Settings → AI API Keys</strong> to enter your own Anthropic or OpenAI key. Your key will be used instead of the shared server key — useful for higher rate limits or when the shared key is unavailable.</p>
        </HelpBlock>
        <HelpBlock title="Analysis limits">
          <p className="text-sm text-muted-foreground">FREE plan: 5 AI analyses/month. BASIC: 50/month. PRO: unlimited. Contact an admin to upgrade.</p>
        </HelpBlock>
      </div>
    ),
  },
  {
    id: "alerts",
    label: "Alerts",
    icon: Bell,
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Price alerts notify you when an instrument hits a target level.</p>
        <HelpBlock title="How alerts work">
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
            <li>Create a Trade Plan with <strong className="text-foreground">Alerts Enabled</strong>. Entry, SL, and TP alerts are created automatically.</li>
            <li>Or go to <strong className="text-foreground">Alerts → New Alert</strong> to create a standalone price alert for any instrument.</li>
            <li>The system polls prices in the background. When a price crosses your target you see a toast notification.</li>
            <li>Triggered alerts appear in the Alerts page with a banner. Click <strong className="text-foreground">Dismiss</strong> to clear them.</li>
          </ol>
        </HelpBlock>
        <HelpBlock title="Alert types">
          <HelpRow label="Entry Hit" desc="Price reached your planned entry." />
          <HelpRow label="Stop Hit" desc="Price hit your stop-loss level." />
          <HelpRow label="Exit Hit" desc="Price reached your take-profit." />
          <HelpRow label="Price Above / Below" desc="Generic threshold alerts for any price level." />
        </HelpBlock>
      </div>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Personalise your experience and manage account details.</p>
        <HelpBlock title="Profile tab">
          <HelpRow label="Full Name" desc="Display name shown in the header." />
          <HelpRow label="AI Provider" desc="Choose Claude or GPT-4 as your default AI engine." />
        </HelpBlock>
        <HelpBlock title="AI API Keys">
          <HelpRow label="Anthropic Key" desc="Your personal Anthropic API key. Overrides the shared server key for all Claude calls." />
          <HelpRow label="OpenAI Key" desc="Your personal OpenAI API key. Overrides the shared server key for all GPT-4 calls." />
          <p className="text-xs text-muted-foreground mt-1">Keys are stored securely. Only the last 4 characters are shown after saving.</p>
        </HelpBlock>
        <HelpBlock title="Custom Fields tab">
          <p className="text-sm text-muted-foreground">Add, rename, reorder, or delete your own values for Strategy Tags, Instruments watchlist, Psychology Tags, Trade Setups, and Session Types. Set a default value to pre-select it in forms. Assign colors for visual tagging.</p>
        </HelpBlock>
      </div>
    ),
  },
  {
    id: "admin",
    label: "Admin",
    icon: ShieldCheck,
    adminOnly: true,
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Admin-only tools for managing users, subscriptions, and trading groups.</p>
        <HelpBlock title="Users">
          <HelpRow label="View all users" desc="See every registered user with their role, plan, and join date." />
          <HelpRow label="Change role" desc="Promote a user to Admin or demote to Viewer. Traders are the default." />
          <HelpRow label="Reset password" desc="Generate a temporary password for a user who is locked out." />
          <HelpRow label="Delete user" desc="Permanently removes the user and all their trades. Irreversible." />
        </HelpBlock>
        <HelpBlock title="Subscriptions">
          <HelpRow label="Upgrade / Downgrade" desc="Change a user's plan between FREE, BASIC, and PRO." />
          <HelpRow label="Set expiry" desc="Grant a time-limited PRO or BASIC subscription with an expiry date." />
          <HelpRow label="Grant trial" desc="Give a user a trial period on a higher plan." />
          <HelpRow label="Plan limits" desc="FREE: 20 trades, 5 AI/mo. BASIC: 200 trades, 50 AI/mo, CSV export. PRO: unlimited." />
        </HelpBlock>
        <HelpBlock title="Trading Groups">
          <HelpRow label="Create group" desc="Groups let multiple traders share a trade feed. Useful for prop firms or teams." />
          <HelpRow label="Manage members" desc="Add or remove members and assign their group role (Trader / Viewer)." />
          <HelpRow label="View group trades" desc="Admins can view all trades posted to any group." />
        </HelpBlock>
        <HelpBlock title="App Settings">
          <HelpRow label="Disable registrations" desc="Toggle off to prevent new users from registering." />
          <HelpRow label="Bulk plan change" desc="Select multiple users and upgrade/downgrade them at once." />
        </HelpBlock>
      </div>
    ),
  },
];

function HelpBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function HelpRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
      <div>
        <span className="font-medium text-foreground">{label}</span>
        {" — "}
        <span className="text-muted-foreground">{desc}</span>
      </div>
    </div>
  );
}

interface HelpDialogProps {
  role: string;
  collapsed?: boolean;
}

export function HelpDialog({ role, collapsed }: HelpDialogProps) {
  const [activeId, setActiveId] = useState("start");
  const isAdmin = role === "ADMIN";
  const visibleSections = sections.filter((s) => !s.adminOnly || isAdmin);
  const active = visibleSections.find((s) => s.id === activeId) ?? visibleSections[0];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors w-full",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? "Help" : undefined}
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          {!collapsed && "Help"}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <HelpCircle className="h-5 w-5 text-blue-500" />
            Help &amp; Guide
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar nav */}
          <div className="w-44 shrink-0 border-r bg-muted/30 py-3 px-2 space-y-0.5 overflow-y-auto">
            {visibleSections.map(({ id, label, icon: Icon, adminOnly }) => (
              <button
                key={id}
                onClick={() => setActiveId(id)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors text-left",
                  activeId === id
                    ? "bg-blue-600 text-white"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  adminOnly && "text-amber-500 hover:text-amber-600"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-5">
              <div className="flex items-center gap-2 mb-4">
                {active && <active.icon className="h-5 w-5 text-blue-500" />}
                <h3 className="font-semibold text-base">{active?.label}</h3>
                {active?.adminOnly && (
                  <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">Admin only</span>
                )}
              </div>
              {active?.content}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
