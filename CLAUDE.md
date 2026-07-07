# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Next.js app that turns commented PGN chess files into an interactive "book." Each PGN game is a
chapter: the comment on the first move is the chapter intro, PGN tag pairs are chapter metadata. A
right-hand panel shows one board per line being viewed — mainline, PGN-annotated sidelines, and
boards the user spawns by playing an off-book move — all sharing one underlying move tree per
chapter. Position analysis comes from Stockfish running client-side in a Web Worker. Users configure
their own LLM (provider/model/API key, BYOK) and their own rating; an AI SDK route streams commentary
calibrated to that rating, with a Lichess opening-explorer tool for position context.

This was scaffolded in one pass (PM → Architect → parallel Frontend/Backend → QA → Review). See
"Scope boundaries" below for what's deliberately deferred.

## Commands

```
npm run dev      # start dev server (Turbopack, default in Next 16)
npm run build    # production build
npm run start    # run a production build
npm run lint     # eslint (flat config; `next lint` is removed in Next 16)
npm test         # vitest run — unit tests for lib/chess and lib/pgn
```

Run a single test file: `npx vitest run lib/chess/moveTree.test.ts`.

`postinstall`/`predev`/`prebuild` all run `scripts/copy-stockfish-assets.mjs`, which copies the
Stockfish WASM engine builds from `node_modules/stockfish/bin/` into `public/stockfish/` (gitignored,
regenerated on install). If Stockfish analysis silently does nothing, check that this script ran and
that `public/stockfish/*.js`/`.wasm` exist.

No database and no server-side auth exist. `.env.example` documents one optional var,
`LICHESS_API_TOKEN` — Lichess's Opening Explorer/Masters/Player endpoints now require OAuth2 (a
recent change from the historically-public API); without a token those specific lookups 401, but the
Tablebase endpoint still works unauthenticated. LLM provider/model/API key are **not** environment
variables — they're entered per-user in the LLM Settings panel and sent client → `/api/chat` only.

## Architecture

### Core domain model: the move tree

`types/chapter.ts` defines the shape everything else builds on:
- `MoveNode`: `{ id (nanoid), ply, san, fenBefore, fenAfter, comment?, nags?, origin: 'pgn'|'user', children }`.
  `children[0]` is always the mainline continuation; `children[1..]` are variations (from the PGN or
  from a user's own move). Ids are stable and **not** derived from tree position — this matters
  because a `BoardInstance` is `{ chapterId, path: string[] }`, a list of child ids to descend from
  root, not a copy of board state. Attaching a new user variation must not invalidate any other
  board's `path`.
- `Chapter`: `{ id, title, tags (PgnTags), introComment, root, rawPgn }`. `introComment` is the
  comment attached to the very first mainline move — that's what renders as the chapter's intro text.

`lib/chess/moveTree.ts` is the one piece of logic almost everything else depends on:
`createRoot(fen?)`, `applyMove(node, moveInput)` (validates legality via `chess.js`, throws on
illegal moves, returns a new detached `MoveNode` with a fresh id and `origin: 'user'` — it does not
mutate the tree), `getNodeByPath(root, path)` (id-based lookup, returns `null` if the path is stale).
`lib/store/chapterStore.ts` (Zustand) is what actually attaches a new node immutably, preserving
object identity for untouched subtrees so other boards' paths stay valid.

### PGN parsing

`chess.js`'s own PGN loader drops RAV variations and doesn't reliably preserve comments/NAGs — do not
route PGN structure through it. `lib/pgn/parseChapter.ts` uses `@mliebelt/pgn-parser` for structure
(comments, NAGs, variations, `[SetUp]`/`[FEN]` mid-game starting positions) and replays the resulting
move list through `chess.js` purely to stamp `fenBefore`/`fenAfter` per node. `lib/pgn/loadChapters.ts`
(server-only, uses `fs`) reads every `.pgn` file in `content/games/`, splitting multi-game files into
one `Chapter` each. Two fixture files live there: `opera-game.pgn` (Morphy's Opera Game, one
sideline) and `berlin-wall.pgn` (starts mid-game via `[SetUp]/[FEN]`, compares the Closed Ruy Lopez
mainline against a Berlin Defense sideline) — both have dedicated regression tests in
`lib/pgn/parseChapter.test.ts` because getting RAV-variation placement right (branching from the
correct parent node, not nested under the move it replaces) was the trickiest part of this parser and
had a real bug during development.

### Boards panel

`components/boards/BoardsPanel.tsx` renders one `BoardCard` per `BoardInstance` in the chapter's
Zustand slice: the mainline, one per PGN sideline (any node with siblings beyond `children[0]`), and
one per user-spawned variation. `Board.tsx` wraps `react-chessboard`, which expects the caller to own
all game logic — it only renders a FEN and reports `onPieceDrop`. A legal off-book drop calls
`applyMove` and spawns a new board; illegal drops are rejected with no state change. Promotion is
hardcoded to queen (no picker) — a known scaffold simplification. Board spawn/dismiss and comment
text changes are animated via `motion`'s `AnimatePresence` (imported from `motion/react`, the
Framer Motion successor) — this is a stated product requirement, not optional polish, so don't
strip it out for convenience.

### Position evaluation: cloud (default) + local Stockfish

Two interchangeable sources, selected per-user via `EngineSettings.analysisSource` (Zustand,
`lib/store/engineSettingsStore.ts`, persisted, defaults to `"cloud"`). `BoardCard.tsx` always calls
*both* `useCloudEval` and `useStockfish` (rules of hooks); which one is `enabled` follows
`analysisSource`, **plus an automatic fallback**: when `analysisSource === "cloud"` and the cloud
lookup comes back `notFound` (or errors) for the current position, `BoardCard` also enables local
Stockfish for that position and switches `engine` (the value everything below — eval bar, analysis
lines, footer status — reads) over to it. This is a per-position, live re-evaluation (`usingFallback`
in `BoardCard.tsx`), not a one-time setting — the same board can serve cloud data for one move and
silently fail over to local for the next if that specific position isn't cached, then back to cloud
again once you're back on a covered line. The fallback is never silent: a "fallback" badge (amber,
`CpuIcon`) appears next to the board's title badge, and the footer status line appends
`(cloud fallback)` once it's producing lines — don't remove these when touching this logic, the whole
point is that switching engines mid-analysis should be obvious, not surprising.

**Cloud** (`components/engine/useCloudEval.ts`): looks up Lichess's Cloud Evaluation API
(`GET /api/lichess/cloud-eval` → `https://lichess.org/api/cloud-eval`, proxied like every other
Lichess call — see below) — a cache of community-contributed engine analysis, **not a live engine**.
No local computation, no WASM/worker loading, so this sidesteps whatever's flaky about the local
engine entirely, but coverage is real-world limited: only positions Lichess has already cached come
back (well-known openings score well; a specific book's deep, obscure, or novel lines often 404 —
verified live, response is `{"error":"No cloud evaluation available for that position"}`, surfaced as
`notFound`, not `error`, so the UI can say "no cloud evaluation" instead of showing a scary error).
**Critically, Lichess's `cp`/`mate` are from White's perspective** — unlike UCI engine output (and
this app's shared `EngineLine` type), which is side-to-move perspective — `useCloudEval` flips the
sign for Black to move before returning, so `EngineEvalBar` and everything else downstream never
needs to know which source it's looking at.

**Local** (`components/engine/useStockfish.ts`): `stockfish` (npm) ships several WASM builds in
`node_modules/stockfish/bin/`. The default is the lite single-threaded build (no special headers
needed); a full multi-threaded build is available and gated behind `self.crossOriginIsolated`
(enabled via the `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` headers in
`next.config.ts`), since it needs `SharedArrayBuffer`.

`components/engine/stockfish.worker.ts` intentionally does **not** load via
`new Worker(new URL('./stockfish.worker.ts', import.meta.url))`. The vendored engine `.js` files are
themselves self-initializing UCI workers that locate their `.wasm` pair via `self.location.href`;
bundling them through Turbopack puts them in a `blob:` context with no resolvable origin (a known
Next.js bug). Instead `useStockfish.ts` does `new Worker("/stockfish/<file>.js")` against the static
assets `scripts/copy-stockfish-assets.mjs` copies into `public/`. The worker talks UCI over
`postMessage`; `useStockfish` surfaces `worker.onerror` and a 15s ready-timeout as an `error` string
so a broken/missing engine asset shows a visible error instead of an infinite "Loading engine…" — this
class of local-engine loading failure (never fully diagnosed in a real browser, since none was
available during development) is exactly why cloud is the default source, not a replacement for local.

### LLM commentary (BYOK)

This app has no server-side LLM credentials and does **not** use the Vercel AI Gateway — the product
requires users to supply their own provider/model/API key, so `lib/ai/providers.ts` constructs an AI
SDK provider directly per request (`createOpenAI({apiKey})` / `createAnthropic({apiKey})`) from
client-supplied values. Keys are never logged or persisted server-side; `lib/store/llmSettingsStore.ts`
persists them client-side only (localStorage), and they travel exclusively in this app's own
`/api/chat` request body.

`app/api/chat/route.ts` (Node runtime) validates the request body with a `zod` schema before doing
anything else — `ChatRequestBody` (`types/llm.ts`) is a compile-time type only and does not guard
against a malformed request at runtime, so don't remove that validation when touching this route.
It builds a rating-calibrated system prompt (`lib/ai/systemPrompt.ts`, four tiers from beginner to
1800+) and calls `streamText` with `lib/ai/tools/lichess-tools.ts`'s opening-explorer tool, returning
`toUIMessageStreamResponse()`. `components/llm/CommentaryPanel.tsx` consumes it via `useChat`
(`@ai-sdk/react`) with a `DefaultChatTransport` whose `body` callback reads the chapter/LLM-settings
stores imperatively at send time (so it always reflects the currently-focused board's FEN, not a
stale value captured at mount) and renders both messages and streaming errors via the installed
AI Elements components (`components/ai-elements/*` — vendored from the `ai-elements` registry, not
hand-written; don't hand-roll chat/markdown rendering, and don't lint/refactor those files, they're
excluded in `eslint.config.mjs`).

### Lichess proxy

Lichess's public API does not reliably send CORS headers, so browser code cannot call it directly
(cloud-eval is actually a documented exception — verified live, it sends `access-control-allow-origin:
*` — but it's still routed through the proxy for consistency with everything else). `app/api/lichess/
[...path]/route.ts` proxies through a **fixed allowlist** keyed off the first path segment
(`lichess`/`masters`/`player` → `explorer.lichess.org`, `tablebase` → `tablebase.lichess.org`,
`cloud-eval` → `lichess.org/api/cloud-eval`) — the rest of the catch-all path is discarded rather than
concatenated into the upstream URL, which is deliberate: don't change this to pass through arbitrary
paths, it would open an SSRF hole. Add `LICHESS_API_TOKEN` to `.env.local` to make the
explorer/masters/player lookups work (unauthenticated requests 401 — expected, not a bug); tablebase
and cloud-eval lookups work without it.

## Scope boundaries (deliberately deferred, not oversights)

No persistent storage or auth beyond `localStorage` (settings) and in-memory parsing (PGNs come from
`content/games/*.pgn` at request time, there's no upload/save flow yet); no full LLM provider catalog
(OpenAI + Anthropic only); only one Lichess tool wired up (opening explorer — tablebase/player lookup
have stubs with TODOs in `lib/lichess/client.ts`); no promotion-piece picker; no CI; no Playwright
E2E suite (only Vitest unit tests for the move-tree/PGN-parsing core exist). Live browser interaction
(drag-and-drop, animations, streaming chat) has not been verified in this environment — neither the
Chrome extension nor an `agent-browser` CLI was available during development, so verification so far
is typecheck + lint + unit tests + server-level curl checks only. A real browser pass is the top
follow-up item.
