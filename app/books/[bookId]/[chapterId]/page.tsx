import { notFound } from "next/navigation";

import { ChapterView } from "@/components/chapter/ChapterView";
import { findBookChapter, loadBooks } from "@/lib/pgn/loadBooks";

interface ChapterPageProps {
  params: Promise<{ bookId: string; chapterId: string }>;
}

export default async function ChapterPage({ params }: ChapterPageProps) {
  const { bookId, chapterId } = await params;
  const found = findBookChapter(loadBooks(), bookId, chapterId);
  if (!found) notFound();

  return <ChapterView chapter={found.chapter} bookId={bookId} />;
}

export function generateStaticParams() {
  return loadBooks().flatMap((book) =>
    book.chapters.map((chapter) => ({ bookId: book.id, chapterId: chapter.id }))
  );
}
