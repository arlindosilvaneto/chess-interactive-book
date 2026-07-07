import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/providers";
import { buildSystemPrompt } from "@/lib/ai/systemPrompt";
import { lichessTools } from "@/lib/ai/tools/lichess-tools";

export const runtime = "nodejs";

// Runtime validation for the request body — `ChatRequestBody` (types/llm.ts)
// is a compile-time-only type and does nothing to guard against a malformed
// or incomplete client request, so it must be checked at this boundary.
const chatRequestSchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())),
  llm: z.object({
    provider: z.enum(["openai", "anthropic"]),
    model: z.string().min(1),
    apiKey: z.string().min(1),
    rating: z.number(),
  }),
  fen: z.string().min(1),
  pgnContext: z.string().optional(),
});

/**
 * POST /api/chat
 *
 * Request body (matches `types/llm.ts#ChatRequestBody`, and what
 * `useChat`/`DefaultChatTransport` sends when configured with
 * `body: { llm, fen, pgnContext }` — those fields are merged in at the top
 * level alongside `messages`, not nested under a wrapper key):
 *   {
 *     messages: UIMessage[];       // chat history, managed by useChat
 *     llm: {
 *       provider: "openai" | "anthropic";
 *       model: string;             // e.g. "gpt-5.1", "claude-sonnet-4-5"
 *       apiKey: string;            // user-supplied, BYOK — never logged/persisted
 *       rating: number;            // used to calibrate commentary tone/depth
 *     };
 *     fen: string;                 // FEN of the position currently being discussed
 *     pgnContext?: string;         // optional surrounding PGN/line text
 *   }
 *
 * Response: an AI SDK UI message stream (`toUIMessageStreamResponse()`),
 * consumable directly by `useChat` on the client.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request body.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { messages, llm, fen, pgnContext } = parsed.data;

  const model = getLanguageModel(llm);
  const system = buildSystemPrompt({ rating: llm.rating, fen, pgnContext });

  const result = streamText({
    model,
    system,
    // `messages` is validated as an array of UIMessage-shaped records above;
    // `convertToModelMessages` does its own structural checks on the parts it reads.
    messages: await convertToModelMessages(messages as Parameters<typeof convertToModelMessages>[0]),
    tools: lichessTools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
