"use client";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PlanBadge } from "@/components/subscription/plan-badge";
import { Loader2, BrainCircuit, KeyRound, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

interface SettingsFormProps {
  user: { id: string; name: string | null; email: string; aiProvider: string; role: string };
  subscription: { plan: string; status: string; expiresAt: Date | null };
  apiKeyHints: { anthropic: string | null; openai: string | null };
}

export function SettingsForm({ user, subscription, apiKeyHints }: SettingsFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [aiProvider, setAiProvider] = useState(user.aiProvider);

  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [hints, setHints] = useState(apiKeyHints);
  const [keysLoading, setKeysLoading] = useState(false);

  const { register, handleSubmit } = useForm({
    defaultValues: { name: user.name ?? "" },
  });

  async function onSubmit(data: { name: string }) {
    setLoading(true);
    const res = await fetch("/api/settings/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: data.name, aiProvider }),
    });
    setLoading(false);
    if (res.ok) {
      toast({ title: "Settings saved" });
      router.refresh();
    } else {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  }

  async function saveApiKey(provider: "anthropic" | "openai") {
    const key = provider === "anthropic" ? anthropicKey : openaiKey;
    if (!key.trim()) return;
    setKeysLoading(true);
    const body = provider === "anthropic"
      ? { anthropicApiKey: key.trim() }
      : { openaiApiKey: key.trim() };
    const res = await fetch("/api/settings/api-keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setKeysLoading(false);
    if (res.ok) {
      const hint = `...${key.trim().slice(-4)}`;
      setHints((h) => ({ ...h, [provider]: hint }));
      if (provider === "anthropic") setAnthropicKey("");
      else setOpenaiKey("");
      toast({ title: "API key saved" });
    } else {
      toast({ title: "Failed to save key", variant: "destructive" });
    }
  }

  async function clearApiKey(provider: "anthropic" | "openai") {
    setKeysLoading(true);
    const body = provider === "anthropic"
      ? { anthropicApiKey: null }
      : { openaiApiKey: null };
    const res = await fetch("/api/settings/api-keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setKeysLoading(false);
    if (res.ok) {
      setHints((h) => ({ ...h, [provider]: null }));
      toast({ title: "API key removed" });
    } else {
      toast({ title: "Failed to remove key", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Profile</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input {...register("name")} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user.email} disabled className="text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                <BrainCircuit className="h-4 w-4" />
                AI Provider
              </Label>
              <Select value={aiProvider} onValueChange={setAiProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLAUDE">Claude (Anthropic)</SelectItem>
                  <SelectItem value="OPENAI">GPT-4 (OpenAI)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Used for trade analysis and chat</p>
            </div>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            AI API Keys
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-xs text-muted-foreground">
            Your own API keys are used instead of the shared server key. Keys are stored securely and never exposed.
          </p>

          {/* Anthropic key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Anthropic (Claude) API Key</Label>
              {hints.anthropic ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-green-600 border-green-600 text-xs gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Key set {hints.anthropic}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-destructive hover:text-destructive"
                    disabled={keysLoading}
                    onClick={() => clearApiKey("anthropic")}
                  >
                    <XCircle className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                </div>
              ) : (
                <Badge variant="outline" className="text-muted-foreground text-xs">Using shared key</Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="sk-ant-..."
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={keysLoading || !anthropicKey.trim()}
                onClick={() => saveApiKey("anthropic")}
              >
                {keysLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>

          {/* OpenAI key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>OpenAI (GPT-4) API Key</Label>
              {hints.openai ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-green-600 border-green-600 text-xs gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Key set {hints.openai}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-destructive hover:text-destructive"
                    disabled={keysLoading}
                    onClick={() => clearApiKey("openai")}
                  >
                    <XCircle className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                </div>
              ) : (
                <Badge variant="outline" className="text-muted-foreground text-xs">Using shared key</Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="sk-..."
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={keysLoading || !openaiKey.trim()}
                onClick={() => saveApiKey("openai")}
              >
                {keysLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Subscription</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Current Plan</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {subscription.plan === "FREE"
                  ? "20 trades/mo, 5 AI analyses, no export"
                  : subscription.plan === "BASIC"
                  ? "200 trades/mo, 50 AI analyses, CSV export"
                  : "Unlimited trades, AI analyses, and exports"}
              </p>
            </div>
            <PlanBadge plan={subscription.plan} />
          </div>
          {subscription.expiresAt && (
            <p className="text-xs text-muted-foreground">Expires: {new Date(subscription.expiresAt).toLocaleDateString()}</p>
          )}
          {subscription.plan === "FREE" && (
            <p className="text-xs text-amber-400">Contact an admin to upgrade your plan.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
