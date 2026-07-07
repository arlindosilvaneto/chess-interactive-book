"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PgnTags } from "@/types/chapter";

import { BookCover } from "./BookCover";

export interface ChapterSummary {
  id: string;
  title: string;
  tags: PgnTags;
}

export interface BookSidebarProps {
  bookId: string;
  bookName: string;
  bookAuthor?: string;
  bookDescription?: string;
  bookCover?: string;
  chapters: ChapterSummary[];
}

/**
 * Persistent chapter navigation for a book: stays mounted across chapter
 * navigation (it lives in the book's layout, not the chapter page), so
 * switching chapters never re-fetches or re-renders the sidebar itself.
 */
export function BookSidebar({
  bookId,
  bookName,
  bookAuthor,
  bookDescription,
  bookCover,
  chapters,
}: BookSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  if (collapsed) {
    return (
      <div className="flex w-12 shrink-0 flex-col items-center gap-3 border-r bg-muted/20 py-4">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand chapter list"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <PanelLeftOpenIcon className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="sticky top-0 flex h-screen w-72 shrink-0 flex-col gap-4 overflow-hidden border-r bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          All books
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse chapter list"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <PanelLeftCloseIcon className="size-4" />
        </button>
      </div>

      <div className="flex gap-3">
        <BookCover src={bookCover} alt={bookName} className="h-20 w-14 shrink-0" />
        <div className="min-w-0">
          <h2 className="text-pretty text-sm leading-snug font-semibold">{bookName}</h2>
          {bookAuthor && <p className="truncate text-xs text-muted-foreground">{bookAuthor}</p>}
        </div>
      </div>

      {bookDescription && (
        <p className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">
          {bookDescription}
        </p>
      )}

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {chapters.map((chapter, index) => {
          const href = `/books/${bookId}/${chapter.id}`;
          const active = pathname === href;
          return (
            <Link
              key={chapter.id}
              href={href}
              className={cn(
                "rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                active ? "bg-accent font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              <span className="tabular-nums text-muted-foreground/70">{index + 1}. </span>
              {chapter.title}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
