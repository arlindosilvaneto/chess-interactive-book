"use client";

import { useState } from "react";

import { BoardsPanel } from "@/components/boards/BoardsPanel";
import { EngineSettingsPanel } from "@/components/engine/EngineSettingsPanel";
import { CommentaryPanel } from "@/components/llm/CommentaryPanel";
import { LlmSettingsPanel } from "@/components/llm/LlmSettingsPanel";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Chapter } from "@/types/chapter";

import { ChapterMetadata } from "./ChapterMetadata";
import { GameText } from "./GameText";

export interface ChapterViewProps {
  chapter: Chapter;
  /** Which book this chapter belongs to — `chapter.id` alone ("1", "2", …) restarts per book file, so it can't key state on its own. */
  bookId: string;
}

export function ChapterView({ chapter, bookId }: ChapterViewProps) {
  const [tab, setTab] = useState("boards");
  // Globally-unique key for this exact chapter, used everywhere the reading
  // position/board state needs to survive navigating away and back — see
  // `useChapterStore`'s `initChapter` doc comment for why `chapter.id` alone
  // isn't enough. NOT a `/`-joined path: this value also flows into
  // `BoardCard`'s DOM `id` (react-chessboard does an internal
  // `querySelector('#<id>-square-...')`), and `/` isn't a valid unescaped
  // CSS identifier character there — the exact bug class already fixed once
  // for numeric chapter ids leading with a digit.
  const chapterKey = `${bookId}__${chapter.id}`;

  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start lg:gap-10">
      <article className="min-w-0 flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="text-balance font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            {chapter.title}
          </h1>
          <ChapterMetadata tags={chapter.tags} />
        </header>
        <Separator />
        <GameText chapter={chapter} chapterKey={chapterKey} />
      </article>

      <aside
        // `max-w-[min(28rem,100%)]` (not a `md:`-only cap): below `lg` this
        // column is full single-column width, which on a wide tablet
        // stretches the (aspect-square) boards much bigger than needed —
        // capping at 28rem trims that. `min(...,100%)` makes it a no-op on
        // screens narrower than 28rem (an actual phone) instead of an
        // additional forced shrink — there's no excess width to trim there,
        // just content that needs to fit what's already available (see the
        // BoardCard header fix for the actual overflow-on-phones bug).
        className="flex min-h-0 max-w-[min(28rem,100%)] flex-col rounded-2xl border bg-card/95 p-3
          shadow-xl shadow-black/5 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:p-4
          mx-auto
          lg:sticky lg:top-8 lg:h-[calc(100vh-4rem)] lg:max-w-none lg:mx-0 dark:shadow-black/40"
      >
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList>
            <TabsTrigger value="boards">Boards</TabsTrigger>
            <TabsTrigger value="commentary">Commentary</TabsTrigger>
            <TabsTrigger value="engine">Engine</TabsTrigger>
          </TabsList>

          <TabsContent value="boards" className="min-h-0 flex-1 overflow-y-auto py-4">
            <BoardsPanel chapter={chapter} chapterKey={chapterKey} />
          </TabsContent>

          <TabsContent value="commentary" className="flex min-h-0 flex-1 flex-col py-4">
            <CommentaryPanel
              chapter={chapter}
              chapterKey={chapterKey}
              onOpenSettings={() => setTab("engine")}
            />
          </TabsContent>

          <TabsContent value="engine" className="min-h-0 flex-1 overflow-y-auto py-4">
            <div className="flex flex-col gap-4">
              <LlmSettingsPanel />
              <EngineSettingsPanel />
            </div>
          </TabsContent>
        </Tabs>
      </aside>
    </div>
  );
}
