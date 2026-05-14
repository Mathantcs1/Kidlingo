import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, CreditCard, Group } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const [userCount, tradeCount, groupCount] = await Promise.all([
    prisma.user.count(),
    prisma.trade.count(),
    prisma.tradingGroup.count(),
  ]);

  const stats = [
    { label: "Total Users", value: userCount, icon: Users, href: "/admin/users" },
    { label: "Total Trades", value: tradeCount, icon: TrendingUp, href: null },
    { label: "Trading Groups", value: groupCount, icon: Group, href: "/admin/groups" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <p className="text-muted-foreground text-sm">Platform management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Card key={label} className={href ? "cursor-pointer hover:bg-muted/20" : ""}>
            {href ? (
              <Link href={href}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <p className="text-3xl font-bold mt-1">{value}</p>
                    </div>
                    <Icon className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Link>
            ) : (
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="text-3xl font-bold mt-1">{value}</p>
                  </div>
                  <Icon className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { href: "/admin/users", title: "User Management", desc: "Manage user roles and permissions" },
          { href: "/admin/subscriptions", title: "Subscriptions", desc: "Manage user plans and billing" },
          { href: "/admin/groups", title: "Trading Groups", desc: "Create and manage trading groups" },
        ].map(({ href, title, desc }) => (
          <Link key={href} href={href}>
            <Card className="hover:bg-muted/20 transition-colors cursor-pointer">
              <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
