"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { PgnTags } from "@/types/chapter";

export interface ChapterMetadataProps {
  tags: PgnTags;
}

const KNOWN_TAG_ORDER: (keyof PgnTags)[] = [
  "Event",
  "Site",
  "Date",
  "Round",
  "White",
  "Black",
  "Result",
  "ECO",
  "WhiteElo",
  "BlackElo",
  "Annotator",
  "PlyCount",
  "EventDate",
];

/** Human-readable labels for the PGN tag names we know about. */
const TAG_LABELS: Partial<Record<string, string>> = {
  Event: "Event",
  Site: "Site",
  Date: "Date",
  Round: "Round",
  White: "White",
  Black: "Black",
  Result: "Result",
  ECO: "ECO",
  WhiteElo: "White Elo",
  BlackElo: "Black Elo",
  Annotator: "Annotator",
  PlyCount: "Ply Count",
  EventDate: "Event Date",
  SetUp: "Set Up",
  FEN: "FEN",
};

/** Falls back to splitting "SomeTagName" into "Some Tag Name" for tags we don't have a label for. */
function humanizeTagKey(key: string): string {
  if (TAG_LABELS[key]) return TAG_LABELS[key];
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/** A short one-line summary shown even while the metadata section is collapsed. */
function summarize(tags: PgnTags): string {
  const parts: string[] = [];
  if (tags.White || tags.Black) {
    parts.push(`${tags.White ?? "?"} vs. ${tags.Black ?? "?"}`);
  }
  if (tags.Event && tags.Event !== "?") parts.push(tags.Event);
  if (tags.Date && tags.Date !== "?.??.??") parts.push(tags.Date);
  return parts.join(" · ");
}

/** Renders PGN header tag pairs as a collapsed-by-default metadata section. */
export function ChapterMetadata({ tags }: ChapterMetadataProps) {
  const [open, setOpen] = useState(false);

  const knownEntries = KNOWN_TAG_ORDER.filter((key) => tags[key] != null).map(
    (key) => [key as string, tags[key] as string] as const
  );
  const extraEntries = Object.entries(tags).filter(
    ([key, value]) => value != null && !KNOWN_TAG_ORDER.includes(key as keyof PgnTags)
  ) as [string, string][];
  const entries = [...knownEntries, ...extraEntries];

  if (entries.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md py-1 text-left text-sm text-muted-foreground",
          "transition-colors hover:text-foreground"
        )}
      >
        <span className="truncate">{summarize(tags) || "Game details"}</span>
        <ChevronDownIcon
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 pt-3 text-sm sm:grid-cols-3">
          {entries.map(([key, value]) => (
            <div key={key} className="flex flex-col">
              <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                {humanizeTagKey(key)}
              </dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}
