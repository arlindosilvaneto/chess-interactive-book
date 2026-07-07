import fs from "node:fs";
import path from "node:path";
import { split } from "@mliebelt/pgn-parser";
import type { Book } from "@/types/book";
import type { Chapter } from "@/types/chapter";
import { parseChapter } from "./parseChapter";

const GAMES_DIR = path.join(process.cwd(), "content", "games");

/** Reserved PGN tag names read off a file's first game as book-level metadata. */
const BOOK_TAGS = {
  name: "Book",
  description: "BookDescription",
  cover: "BookCover",
  author: "BookAuthor",
} as const;

/** "modern-french" / "modern_french" -> "Modern French" (fallback title when no [Book] tag exists). */
function humanizeFilename(basename: string): string {
  return basename
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Server-only: reads every `.pgn` file in `content/games/` as one `Book`
 * each. A file's games become that book's chapters (1-indexed chapter ids,
 * stable as long as the file's game order doesn't change). Book identity
 * (name/description/cover/author) comes from the reserved tags above on the
 * first game, if present — otherwise the book falls back to a humanized
 * filename with no description/cover/author, so ordinary PGN files (with no
 * knowledge of this app's conventions) still work.
 */
export function loadBooks(): Book[] {
  if (!fs.existsSync(GAMES_DIR)) return [];

  const pgnFiles = fs
    .readdirSync(GAMES_DIR)
    .filter((file) => file.toLowerCase().endsWith(".pgn"))
    .sort();

  const books: Book[] = [];

  for (const file of pgnFiles) {
    const basename = path.basename(file, path.extname(file));
    const fullText = fs.readFileSync(path.join(GAMES_DIR, file), "utf-8");
    const games = split(fullText);
    if (games.length === 0) continue;

    const chapters = games.map((game, index) =>
      parseChapter(game.all, String(index + 1), game.all)
    );

    const firstTags = chapters[0].tags;
    books.push({
      id: basename,
      name: firstTags[BOOK_TAGS.name] || humanizeFilename(basename),
      description: firstTags[BOOK_TAGS.description],
      coverImage: firstTags[BOOK_TAGS.cover],
      author: firstTags[BOOK_TAGS.author],
      chapters,
    });
  }

  return books;
}

/** Looks up one chapter within one book by id, or `undefined` if either doesn't exist. */
export function findBookChapter(
  books: Book[],
  bookId: string,
  chapterId: string
): { book: Book; chapter: Chapter } | undefined {
  const book = books.find((b) => b.id === bookId);
  const chapter = book?.chapters.find((c) => c.id === chapterId);
  return book && chapter ? { book, chapter } : undefined;
}
