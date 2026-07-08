/**
 * Shared color palette keyed by variation-nesting depth, used by both
 * GameText (book text) and BoardCard (the boards panel) so a sideline's
 * text and its board read as the same color at a glance — depth 1 is
 * always rose, depth 2 amber, and so on, cycling for anything deeper.
 */
export interface DepthAccent {
  /** Saturated background+text for the active move-link / board indicators. */
  active: string;
  /** Top accent border color for a BoardCard at this depth. */
  border: string;
  /**
   * Fully-qualified `before:`/`after:` (+ their `dark:` variants) classes
   * for the parenthesis glyphs wrapping a variation block — pre-composed
   * here rather than built by string-concatenating a prefix onto a plain
   * color class, since `before:${"text-x dark:text-y"}` would only chain
   * `before:` onto the first class and leave `dark:text-y` unprefixed.
   */
  paren: string;
  /** Always-visible (not just active) subtle background tint for a variation block. */
  tint: string;
  /** Left-border "guide line" color for an indented variation block in GameText. */
  rule: string;
}

const PALETTE: DepthAccent[] = [
  {
    active: "bg-rose-500/15 text-rose-600 hover:bg-rose-500/20 dark:text-rose-400",
    border: "border-t-rose-500 dark:border-t-rose-400",
    paren: "before:text-rose-500 after:text-rose-500 dark:before:text-rose-400 dark:after:text-rose-400",
    tint: "bg-rose-500/8 dark:bg-rose-400/10",
    rule: "border-l-rose-500/40 dark:border-l-rose-400/50",
  },
  {
    active: "bg-amber-500/15 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400",
    border: "border-t-amber-500 dark:border-t-amber-400",
    paren: "before:text-amber-600 after:text-amber-600 dark:before:text-amber-400 dark:after:text-amber-400",
    tint: "bg-amber-500/8 dark:bg-amber-400/10",
    rule: "border-l-amber-500/40 dark:border-l-amber-400/50",
  },
  {
    active: "bg-violet-500/15 text-violet-600 hover:bg-violet-500/20 dark:text-violet-400",
    border: "border-t-violet-500 dark:border-t-violet-400",
    paren: "before:text-violet-500 after:text-violet-500 dark:before:text-violet-400 dark:after:text-violet-400",
    tint: "bg-violet-500/8 dark:bg-violet-400/10",
    rule: "border-l-violet-500/40 dark:border-l-violet-400/50",
  },
  {
    active: "bg-teal-500/15 text-teal-600 hover:bg-teal-500/20 dark:text-teal-400",
    border: "border-t-teal-500 dark:border-t-teal-400",
    paren: "before:text-teal-600 after:text-teal-600 dark:before:text-teal-400 dark:after:text-teal-400",
    tint: "bg-teal-500/8 dark:bg-teal-400/10",
    rule: "border-l-teal-500/40 dark:border-l-teal-400/50",
  },
];

export const MAINLINE_ACCENT: Pick<DepthAccent, "active" | "border"> = {
  active: "bg-primary/15 text-primary hover:bg-primary/20",
  border: "border-t-primary",
};

/** `depth` is 1 for the first level of variation, 2 for a variation nested inside that, etc. */
export function variationAccent(depth: number): DepthAccent {
  return PALETTE[(depth - 1) % PALETTE.length];
}

/** `level` is the board's index in the stack: 0 = mainline, 1+ = sideline depth. */
export function boardAccent(level: number): Pick<DepthAccent, "active" | "border"> {
  return level === 0 ? MAINLINE_ACCENT : variationAccent(level);
}
