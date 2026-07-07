"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useLlmSettingsStore } from "@/lib/store/llmSettingsStore";
import type { LlmProviderId } from "@/types/llm";

const PROVIDERS: { id: LlmProviderId; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
];

/** Provider/model/API key/rating, persisted to localStorage. Keys never leave the browser except in this app's own /api/chat requests. */
export function LlmSettingsPanel() {
  const settings = useLlmSettingsStore((state) => state.settings);
  const setProvider = useLlmSettingsStore((state) => state.setProvider);
  const setModel = useLlmSettingsStore((state) => state.setModel);
  const setApiKey = useLlmSettingsStore((state) => state.setApiKey);
  const setRating = useLlmSettingsStore((state) => state.setRating);
  const setLichessApiToken = useLlmSettingsStore((state) => state.setLichessApiToken);

  return (
    <Card>
      <CardHeader>
        <CardTitle>LLM commentary settings</CardTitle>
        <CardDescription>
          Bring your own provider, model, and API key. Your key is stored
          only in this browser and sent only to this app&apos;s own{" "}
          <code>/api/chat</code> route, per request.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="llm-provider">Provider</Label>
          <Select
            value={settings.provider}
            onValueChange={(value) => setProvider(value as LlmProviderId)}
          >
            <SelectTrigger id="llm-provider" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="llm-model">Model</Label>
          <Input
            id="llm-model"
            placeholder={
              settings.provider === "openai" ? "gpt-5.1" : "claude-sonnet-4-5"
            }
            value={settings.model}
            onChange={(event) => setModel(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="llm-api-key">API key</Label>
          <Input
            id="llm-api-key"
            type="password"
            autoComplete="off"
            placeholder="sk-…"
            value={settings.apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="llm-rating">Your rating (approx.)</Label>
          <Input
            id="llm-rating"
            type="number"
            min={100}
            max={3000}
            step={50}
            value={settings.rating}
            onChange={(event) => setRating(Number(event.target.value) || 0)}
          />
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <Label htmlFor="llm-lichess-token">Lichess API token (optional)</Label>
          <Input
            id="llm-lichess-token"
            type="password"
            autoComplete="off"
            placeholder="lip_…"
            value={settings.lichessApiToken ?? ""}
            onChange={(event) => setLichessApiToken(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Enables the opening-explorer tool during commentary (move popularity, win rates,
            opening names). Lichess now requires a personal token for this endpoint — create a
            free one at{" "}
            <a
              href="https://lichess.org/account/oauth/token"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              lichess.org/account/oauth/token
            </a>{" "}
            (no scopes needed — any token works). Without one, commentary still works, but the
            assistant will say it can&apos;t look up opening statistics.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
