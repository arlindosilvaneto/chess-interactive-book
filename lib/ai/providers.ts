import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import type { LlmSettings } from "@/types/llm";

/**
 * Builds an AI SDK `LanguageModel` for a single request from user-supplied
 * BYOK settings. This app never uses the Vercel AI Gateway or an
 * env-configured server API key — each request constructs its own provider
 * instance directly from `llm.apiKey`, which must never be logged or
 * persisted.
 */
export function getLanguageModel(llm: LlmSettings): LanguageModel {
  switch (llm.provider) {
    case "openai":
      return createOpenAI({ apiKey: llm.apiKey })(llm.model);
    case "anthropic":
      return createAnthropic({ apiKey: llm.apiKey })(llm.model);
    default: {
      const exhaustiveCheck: never = llm.provider;
      throw new Error(`Unsupported LLM provider: ${String(exhaustiveCheck)}`);
    }
  }
}
