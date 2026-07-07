import type { Chapter } from "./chapter";

/**
 * A "book" groups every game in one `.pgn` file under shared identity. PGN
 * has no native concept of this, so we read it off a small set of reserved
 * tag names on the file's *first* game (see `lib/pgn/loadBooks.ts`):
 *
 *   [Book "The Modern French: A Complete Guide"]
 *   [BookDescription "A repertoire for Black against 1.e4 e6."]
 *   [BookCover "/covers/modern-french.jpg"]
 *   [BookAuthor "Jane Doe"]
 *   [Event "..."]
 *   ...the rest of the game's ordinary tags...
 *
 * These are ordinary extra PGN tag pairs — any parser that doesn't know
 * about them just ignores them — so existing PGN files keep working with a
 * humanized-filename fallback title and no cover/description/author.
 *
 * IMPORTANT: they must sit directly above `[Event ...]` with **no blank
 * line** before it. `@mliebelt/pgn-parser`'s `split()` (used to pull
 * individual games out of a multi-game file) treats a blank line as the end
 * of the tag-pair section — per the PGN spec, a game has exactly one
 * contiguous tag-pair block, followed by one blank line, then the
 * movetext. A blank line *inside* the tag section makes `split()` silently
 * keep only the tags after the blank line, discarding these before it.
 */
export interface Book {
  /** Derived from the filename (without extension), e.g. "modern-french". */
  id: string;
  name: string;
  description?: string;
  coverImage?: string;
  author?: string;
  chapters: Chapter[];
}
