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

### Position evaluation: cloud (default), local, or server Stockfish

Three interchangeable sources, selected per-user via `EngineSettings.analysisSource` (Zustand,
`lib/store/engineSettingsStore.ts`, persisted, defaults to `"cloud"`). `BoardCard.tsx` always calls
*all three* of `useCloudEval`, `useStockfish`, and `useServerStockfish` (rules of hooks); which ones
are `enabled` follows `analysisSource`, **plus an automatic fallback CHAIN**:

```
cloud  → server → local   (cloud has nothing cached / errors → try server → then local)
server → local            (server errors → try local)
local                     (no further fallback — it's already the last resort)
```

`BoardCard.tsx` computes `cloudFailed`/`serverFailed` from each hook's own `notFound`/`error`, derives
`usingServerFallback`/`usingLocalFallback` from those (mutually exclusive — see the boolean logic right
above where `engine` is picked), and switches `engine` (the value everything below — eval bar,
analysis lines, footer status — reads) to whichever tier is currently live. This is a per-position,
live re-evaluation, not a one-time setting — the same board can serve cloud data for one move and
silently hop to server (or all the way to local) for the next if that specific position isn't cached,
then back to cloud again once you're back on a covered line. The fallback is never silent: an amber
badge (`CpuIcon`/spinner, labeled "server fallback" or "local fallback") appears next to the board's
title badge, and the footer status line appends `(server fallback)`/`(local fallback)` once it's
producing lines — don't remove these when touching this logic, the whole point is that switching
engines mid-analysis should be obvious, not surprising. The Analysis-source picker in
`EngineSettingsPanel.tsx` is ordered cloud → server → local to match this chain — keep it that way if
the chain order ever changes.

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

**Server** (`components/engine/useServerStockfish.ts` → `POST /api/engine/evaluate` →
`lib/engine/nodeStockfishEngine.ts`): a third source — the same engine build as "local", but run in
the Node.js function instead of the reader's browser, trading a network round-trip for skipping the
in-browser WASM boot. Runs a bounded `go depth N` and returns the finished result in one response
(no streaming/SSE — Vercel Functions are request/response, and a depth-bounded search has a natural
end, unlike the browser Worker's open-ended `go infinite` semantics). The Node engine instance is a
module-scope singleton reused across warm invocations (avoids re-instantiating WASM per request), and
`evaluatePosition` serializes concurrent calls through a queue — the engine has exactly one output
listener slot and can only run one search at a time.

This does **not** go through the `stockfish` package's own Node entry point (`require("stockfish")`).
Two real, non-obvious problems were found only by hitting the actual dev server (not by reading the
source, and not by testing in plain Node — both looked fine in isolation):
- `stockfish`'s `index.js` does `require(path.join(__dirname, "bin", filename))` — a *runtime-computed*
  path. Turbopack can't statically follow that and fails the whole route with
  `Module not found ... <dynamic>` the instant it's hit. Fix: `nodeStockfishEngine.ts` requires the
  exact build file directly with a **literal string**
  (`require("stockfish/bin/stockfish-18-lite-single.js")`) — as statically-resolvable to the bundler
  as a normal import — and replicates the handful of lines of setup `index.js` would otherwise do
  (`locateFile`, the UCI handshake, wrapping `sendCommand`).
- The sibling `.wasm` file's path can't be found via `require.resolve(...)` either — Turbopack rewrites
  that into its own virtual `[project]/...` module identifier rather than a real filesystem path, which
  throws `ENOENT` when hit with `fs.readFileSync`. Built from `process.cwd()` instead, which is exactly
  where `outputFileTracingIncludes` (`next.config.ts`) places `node_modules/stockfish/bin/**` in a
  deployed function.
- `index.js` also never sets `engine.listener`, so by default every UCI line goes to
  `console.log`/`console.error` instead of being readable programmatically — the compiled module's
  `print`/`printErr` callbacks check `.listener` on the exact config object you pass in, at call time,
  so setting it after construction works, it's just an unlisted side door rather than documented API.

**CRITICAL gotcha, found live in production-like testing (not from reading the source)**: the vendored
engine's own Node-detection shim (inside the huge compiled IIFE, not anything this app wrote) does
`"undefined"!=typeof global && ...process... && "undefined"!=typeof fetch && (...,fetch=null)` —
unconditionally nulling the **global** `fetch` the moment it detects it's running under Node, as an
old-Node-without-native-fetch compat shim that never checks whether `fetch` already works. Since this
engine runs in the same Node.js process as every other route, the first time ANY board uses the server
analysis source, `fetch` silently breaks for the rest of the server's process lifetime — the Lichess
proxy and the AI SDK's calls in `/api/chat` both started throwing `TypeError: fetch is not a function`
immediately afterward, confirmed live. `createEngine()` in `nodeStockfishEngine.ts` works around this
by snapshotting `globalThis.fetch` before calling the factory and restoring it right after — safe
because the nulling happens synchronously (before any `await`), and this engine never needs fetch
itself (its `locateFile` already routes WASM loading through `fs`, not the network). **Do not remove
this restore** when touching `createEngine()` — it's the only thing standing between this feature and
silently breaking every other route on the server.

**Operational note**: an internal engine fault (seen while developing this against a corrupted asset
path) can call `process.exit()` inside the Node process, not just throw/reject — Emscripten's abort
path does this. In a traditional long-lived server this would take down every concurrent user; on
Vercel's per-invocation function model it instead just costs the next request a cold start on a fresh
container. Acceptable for this app's scale; worth knowing before assuming a promise rejection is the
only failure mode to guard against here.

**Debouncing** (`lib/hooks/useDebouncedValue.ts`): all three hooks (cloud, local, server) split
their work into two effects keyed on the raw `fen` vs. a `useDebouncedValue(fen, N)`-derived one.
The raw-`fen` effect only ever does cheap, synchronous things — a cache hit resolves instantly, an
uncached position clears `lines`/flips to a loading state — so paging quickly through a line never
shows a stale score left over from a previous position. The actual expensive call (the Lichess
fetch, telling the Stockfish worker to stop/reposition/go, or the `/api/engine/evaluate` request) is
keyed on the debounced value, so holding an arrow key or clicking "next" repeatedly fires it once,
after the position settles, not once per intermediate position. Don't collapse this back into a
single fen-keyed effect — that's what caused the request/search spam this was added to fix.

`N` deliberately differs by source: local/server are 300ms (`useStockfish.ts`,
`useServerStockfish.ts`) since their only cost is this app's own CPU; cloud is **1000ms**
(`useCloudEval.ts`) since it's a shared third-party resource with its own rate limit — confirmed
live, even the standard starting position (always cached) started returning `429 Too many requests`
after enough cumulative requests during this app's own development. Don't shrink cloud's debounce
back down to match the others without re-considering that tradeoff.

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
`toUIMessageStreamResponse()`.

**The opening-explorer tool is also BYOK**, same as the LLM API key — `LlmSettings.lichessApiToken`
(`types/llm.ts`), entered in `LlmSettingsPanel.tsx`, sent per-request alongside `llm.apiKey`. This is
deliberately a `createLichessTools(lichessApiToken)` **factory** (`lib/ai/tools/lichess-tools.ts`),
not a static tool export — the token is only known per-request, from the validated chat body, not at
module load time. Two things worth preserving if you touch this: (1) the tool's `execute` never
throws — a thrown error surfaces in the chat UI as a generic, unhelpful "An error occurred" card, so
both the no-token case and any upstream failure are instead returned as a normal
`{available: false, reason}` result, letting the model see why and respond naturally; (2) the
missing-token check happens *before* attempting the network call (a certain failure otherwise), not
as a caught exception — Lichess's opening-explorer endpoints are `security: [OAuth2: []]` per their
own OpenAPI spec (confirmed by fetching `github.com/lichess-org/api`'s spec directly, not assumed —
any valid personal token works, no specific scope), unlike the Cloud Evaluation endpoint this app also
uses, which is explicitly `security: []` (public, confirmed the same way). Don't conflate the two
endpoints' auth requirements again.

`components/llm/CommentaryPanel.tsx` consumes it via `useChat`
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
paths, it would open an SSRF hole. `LICHESS_API_TOKEN` in `.env.local` is a server-operator fallback
for this proxy's own explorer/masters/player routes only (nothing client-side currently calls them —
unauthenticated requests 401, expected, not a bug); it does **not** feed the opening-explorer AI tool,
which is BYOK per-user instead — see "LLM commentary" above. Tablebase and cloud-eval lookups work
without any token either way.

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
