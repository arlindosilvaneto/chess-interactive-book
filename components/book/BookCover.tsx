import { BookIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface BookCoverProps {
  src?: string;
  alt: string;
  className?: string;
}

/**
 * A plain `<img>`, not `next/image`, is deliberate here: `coverImage` comes
 * from a user-supplied `[BookCover]` PGN tag and can be any URL on any host,
 * which `next/image` can't optimize without an `images.remotePatterns`
 * allowlist known ahead of time. Falls back to a placeholder when unset.
 */
export function BookCover({ src, alt, className }: BookCoverProps) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={cn("rounded-md bg-muted object-cover", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md bg-gradient-to-br from-muted to-muted-foreground/20 text-muted-foreground",
        className
      )}
      aria-hidden
    >
      <BookIcon className="size-6" />
    </div>
  );
}
