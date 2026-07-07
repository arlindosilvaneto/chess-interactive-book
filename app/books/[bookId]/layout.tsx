import { notFound } from "next/navigation";

import { BookSidebar } from "@/components/book/BookSidebar";
import { loadBooks } from "@/lib/pgn/loadBooks";

interface BookLayoutProps {
  children: React.ReactNode;
  params: Promise<{ bookId: string }>;
}

/**
 * Wraps every page under /books/[bookId] with a persistent, collapsible
 * chapter sidebar — it lives here (not in the chapter page) so switching
 * chapters via the sidebar links doesn't remount it.
 */
export default async function BookLayout({ children, params }: BookLayoutProps) {
  const { bookId } = await params;
  const book = loadBooks().find((b) => b.id === bookId);
  if (!book) notFound();

  return (
    <div className="flex min-h-0 flex-1">
      <BookSidebar
        bookId={book.id}
        bookName={book.name}
        bookAuthor={book.author}
        bookDescription={book.description}
        bookCover={book.coverImage}
        chapters={book.chapters.map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          tags: chapter.tags,
        }))}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function generateStaticParams() {
  return loadBooks().map((book) => ({ bookId: book.id }));
}
