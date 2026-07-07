"use client";

import { AnimatePresence, motion } from "motion/react";

import type { MoveNode } from "@/types/chapter";

export interface CommentPanelProps {
  node: MoveNode | null;
  /** Shown when `node` is the chapter root (no move played yet). */
  introComment?: string;
}

/** Displays the active node's comment, cross-fading when the active node changes. */
export function CommentPanel({ node, introComment }: CommentPanelProps) {
  const isRoot = !node || node.san == null;
  const comment = isRoot ? introComment : node?.comment;
  const key = node?.id ?? "root";

  return (
    <div className="min-h-10">
      <AnimatePresence mode="wait">
        {comment ? (
          <motion.p
            key={key}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="text-sm leading-relaxed text-foreground"
          >
            {comment}
          </motion.p>
        ) : (
          <motion.p
            key={`${key}-empty`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="text-sm italic text-muted-foreground"
          >
            No comment at this position.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
