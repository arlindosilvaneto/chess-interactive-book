"use client";

import { useEffect, useState } from "react";

/**
 * Returns `value`, but only updates to a new value once it stops changing
 * for `delayMs` — collapses a rapid burst of changes (e.g. holding an arrow
 * key or clicking "next" repeatedly through a line) into a single update
 * once things settle, instead of one update per intermediate value.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
