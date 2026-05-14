import type { ReactNode } from "react";
import { Activity } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-xl shadow-blue-500/30">
            <Activity className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400 tracking-tight">
            TradePulse
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
