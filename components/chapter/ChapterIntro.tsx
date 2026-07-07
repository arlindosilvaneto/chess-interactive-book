import type { Chapter } from "@/types/chapter";

export interface ChapterIntroProps {
  chapter: Chapter;
}

/** Renders the comment attached to move 1 as the chapter's introduction. */
export function ChapterIntro({ chapter }: ChapterIntroProps) {
  if (!chapter.introComment) return null;

  return (
    <p className="text-pretty leading-loose text-foreground">
      {chapter.introComment}
    </p>
  );
}
