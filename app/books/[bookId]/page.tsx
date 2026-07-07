import { notFound, redirect } from "next/navigation";

import { loadBooks } from "@/lib/pgn/loadBooks";

interface BookIndexPageProps {
  params: Promise<{ bookId: string }>;
}

/** Selecting a book jumps straight into reading it — its first chapter — rather than a separate overview page. */
export default async function BookIndexPage({ params }: BookIndexPageProps) {
  const { bookId } = await params;
  const book = loadBooks().find((b) => b.id === bookId);
  const firstChapter = book?.chapters[0];
  if (!firstChapter) notFound();

  redirect(`/books/${bookId}/${firstChapter.id}`);
}
