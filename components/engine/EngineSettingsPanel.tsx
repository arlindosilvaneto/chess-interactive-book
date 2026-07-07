"use client";

import { useSyncExternalStore } from "react";
import { CloudIcon, CpuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AnalysisSource } from "@/lib/store/engineSettingsStore";
import { useEngineSettingsStore } from "@/lib/store/engineSettingsStore";

import { supportsCrossOriginIsolation } from "./useStockfish";

function subscribeNever() {
  return () => {};
}

function getServerCrossOriginIsolatedSnapshot() {
  return false;
}

interface SettingRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function SettingRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
}: SettingRowProps) {
  const id = `engine-setting-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className={disabled ? "text-muted-foreground" : undefined}>
          {label}
        </Label>
        <span className="text-xs text-muted-foreground tabular-nums">
          {value}
        </span>
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        onValueChange={([next]) => onChange(next)}
      />
    </div>
  );
}

const SOURCE_OPTIONS: { value: AnalysisSource; label: string; description: string }[] = [
  {
    value: "cloud",
    label: "Lichess cloud",
    description: "Looks up community-analyzed positions — no local computation.",
  },
  {
    value: "local",
    label: "Local Stockfish",
    description: "Runs Stockfish 18 in your browser (WASM) — works for any position.",
  },
];

/** User-adjustable position-evaluation settings: source (cloud vs. local) plus local-engine tuning, persisted to localStorage. */
export function EngineSettingsPanel() {
  const settings = useEngineSettingsStore((state) => state.settings);
  const setAnalysisSource = useEngineSettingsStore((state) => state.setAnalysisSource);
  const setDepth = useEngineSettingsStore((state) => state.setDepth);
  const setMultiPv = useEngineSettingsStore((state) => state.setMultiPv);
  const setThreads = useEngineSettingsStore((state) => state.setThreads);
  const setHashMb = useEngineSettingsStore((state) => state.setHashMb);
  const setUseMultiThreadIfAvailable = useEngineSettingsStore(
    (state) => state.setUseMultiThreadIfAvailable
  );

  // Cross-origin isolation never changes during a session, so there's
  // nothing to subscribe to — this just safely defers reading the
  // client-only value until after hydration (matches SSR's `false`).
  const crossOriginIsolated = useSyncExternalStore(
    subscribeNever,
    supportsCrossOriginIsolation,
    getServerCrossOriginIsolatedSnapshot
  );

  const isLocal = settings.analysisSource === "local";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Engine settings</CardTitle>
        <CardDescription>
          Choose where position evaluation comes from, and tune the local
          engine when you use it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label>Analysis source</Label>
          <div className="grid grid-cols-2 gap-2">
            {SOURCE_OPTIONS.map((option) => {
              const Icon = option.value === "cloud" ? CloudIcon : CpuIcon;
              const selected = settings.analysisSource === option.value;
              return (
                <Tooltip key={option.value}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={selected ? "default" : "outline"}
                      className={cn("flex h-auto flex-col items-center gap-1.5 py-3")}
                      onClick={() => setAnalysisSource(option.value)}
                    >
                      <Icon className="size-4" />
                      {option.label}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{option.description}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <span className="text-xs text-muted-foreground">
            {settings.analysisSource === "cloud"
              ? "Fast and reliable, but only covers positions Lichess has already cached — expect gaps in deep or unusual lines."
              : "Works for any position, but runs in your browser and can be slower or fail to load on some devices."}
          </span>
        </div>

        <SettingRow
          label="MultiPV (lines)"
          value={settings.multiPv}
          min={1}
          max={5}
          onChange={setMultiPv}
        />

        <SettingRow
          label="Depth"
          value={settings.depth}
          min={6}
          max={30}
          disabled={!isLocal}
          onChange={setDepth}
        />
        <SettingRow
          label="Hash (MB)"
          value={settings.hashMb}
          min={8}
          max={256}
          step={8}
          disabled={!isLocal}
          onChange={setHashMb}
        />
        <SettingRow
          label="Threads"
          value={settings.threads}
          min={1}
          max={8}
          disabled={!isLocal || !settings.useMultiThreadIfAvailable || !crossOriginIsolated}
          onChange={setThreads}
        />

        <div
          className={cn(
            "flex items-center justify-between gap-4",
            !isLocal && "opacity-50"
          )}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="engine-multithread">Use multi-threaded engine</Label>
            <span className="text-xs text-muted-foreground">
              {crossOriginIsolated
                ? "Supported in this browser — stronger, uses more CPU."
                : "Not available (requires cross-origin isolation)."}
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Switch
                  id="engine-multithread"
                  checked={settings.useMultiThreadIfAvailable}
                  disabled={!isLocal || !crossOriginIsolated}
                  onCheckedChange={setUseMultiThreadIfAvailable}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {crossOriginIsolated
                ? "Falls back to the single-threaded build if unsupported."
                : "This page isn't cross-origin isolated, so only the single-threaded build can run."}
            </TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  );
}
