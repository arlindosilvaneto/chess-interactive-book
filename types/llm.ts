import type { UIMessage } from "ai";

export type LlmProviderId = "openai" | "anthropic";

export interface LlmSettings {
  provider: LlmProviderId;
  model: string;
  /** User-supplied key. Sent to our own API route per-request only — never persisted server-side. */
  apiKey: string;
  /** Approximate player rating, used to pitch commentary at the user's level. */
  rating: number;
}

export interface ChatRequestBody {
  llm: LlmSettings;
  fen: string;
  pgnContext?: string;
  messages: UIMessage[];
}
