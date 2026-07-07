import Link from "next/link";

import { BookCover } from "@/components/book/BookCover";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { loadBooks } from "@/lib/pgn/loadBooks";

export default function Home() {
  const books = loadBooks();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Chess Interactive Book
        </h1>
        <p className="text-muted-foreground">
          Commented PGN files rendered as books — pick one to start reading,
          with sideline boards, live Stockfish analysis, and LLM commentary
          pitched at your level.
        </p>
      </header>

      <ol className="flex flex-col gap-4">
        {books.map((book) => (
          <li key={book.id}>
            <Link href={`/books/${book.id}`} className="block">
              <Card className="transition-colors hover:bg-accent/50">
                <CardContent className="flex gap-4">
                  <BookCover
                    src={book.coverImage}
                    alt={book.name}
                    className="h-24 w-16 shrink-0"
                  />
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{book.name}</CardTitle>
                      <Badge variant="secondary">
                        {book.chapters.length}{" "}
                        {book.chapters.length === 1 ? "chapter" : "chapters"}
                      </Badge>
                    </div>
                    {book.author && (
                      <p className="text-sm text-muted-foreground">{book.author}</p>
                    )}
                    {book.description && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {book.description}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
