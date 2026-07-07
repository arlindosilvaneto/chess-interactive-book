import type { UIMessage } from "ai";

export type LlmProviderId = "openai" | "anthropic";

export interface LlmSettings {
  provider: LlmProviderId;
  model: string;
  /** User-supplied key. Sent to our own API route per-request only — never persisted server-side. */
  apiKey: string;
  /** Approximate player rating, used to pitch commentary at the user's level. */
  rating: number;
  /**
   * User-supplied Lichess personal API token (BYOK, same handling as `apiKey`
   * — stored client-side only, sent per-request). Enables the
   * `lichessOpeningExplorer` tool: per Lichess's own OpenAPI spec, the
   * opening-explorer endpoints require `security: [OAuth2: []]` (any valid
   * token, no specific scope) — unlike the cloud-eval endpoint this app also
   * uses, which is explicitly `security: []` (public). Optional — the tool
   * degrades to reporting itself unavailable rather than failing the whole
   * chat request when this is unset.
   */
  lichessApiToken?: string;
}

export interface ChatRequestBody {
  llm: LlmSettings;
  fen: string;
  pgnContext?: string;
  messages: UIMessage[];
}
