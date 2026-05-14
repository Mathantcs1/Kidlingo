import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, cn, toDecimal } from "@/lib/utils";

interface Trade {
  id: string;
  instrument: string;
  direction: string;
  pnl: unknown;
  rMultiple: unknown;
  entryDate: Date;
}

export function BestWorstTrades({ trades }: { trades: Trade[] }) {
  const closed = trades.filter((t) => toDecimal(t.pnl) !== 0)
    .sort((a, b) => toDecimal(b.pnl) - toDecimal(a.pnl));
  const best = closed.slice(0, 3);
  const worst = closed.slice(-3).reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Best & Worst Trades</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-emerald-500 mb-2">Top Wins</p>
            <div className="space-y-2">
              {best.map((t) => (
                <div key={t.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">{t.instrument}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(t.entryDate)}</p>
                  </div>
                  <span className="text-xs font-semibold text-emerald-500">
                    {formatCurrency(toDecimal(t.pnl))}
                  </span>
                </div>
              ))}
              {best.length === 0 && <p className="text-xs text-muted-foreground">No trades</p>}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-red-500 mb-2">Worst Losses</p>
            <div className="space-y-2">
              {worst.map((t) => (
                <div key={t.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">{t.instrument}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(t.entryDate)}</p>
                  </div>
                  <span className="text-xs font-semibold text-red-500">
                    {formatCurrency(toDecimal(t.pnl))}
                  </span>
                </div>
              ))}
              {worst.length === 0 && <p className="text-xs text-muted-foreground">No trades</p>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
