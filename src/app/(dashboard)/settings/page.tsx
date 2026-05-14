import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/settings/settings-form";
import { DropdownManager } from "@/components/settings/dropdown-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUserSubscription } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const [user, dropdownValues, subscription] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, aiProvider: true, role: true, anthropicApiKey: true, openaiApiKey: true },
    }),
    prisma.userDropdownValue.findMany({
      where: { userId: session.user.id },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    getUserSubscription(session.user.id),
  ]);

  if (!user) redirect("/login");

  const mask = (key: string | null | undefined) => (key ? `...${key.slice(-4)}` : null);
  const apiKeyHints = {
    anthropic: mask(user.anthropicApiKey),
    openai: mask(user.openaiApiKey),
  };
  const userForForm = { id: user.id, name: user.name, email: user.email, aiProvider: user.aiProvider, role: user.role };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Manage your account and preferences</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="dropdowns">Custom Fields</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <SettingsForm user={userForForm} subscription={subscription} apiKeyHints={apiKeyHints} />
        </TabsContent>

        <TabsContent value="dropdowns">
          <DropdownManager initialValues={dropdownValues} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
