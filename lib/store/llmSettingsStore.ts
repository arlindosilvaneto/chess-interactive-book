import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { LlmProviderId, LlmSettings } from "@/types/llm";

/**
 * LLM API keys are user-supplied and persisted to localStorage only — they
 * are never sent anywhere except this app's own `/api/chat` route, attached
 * per-request from this store's current value (see CommentaryPanel.tsx).
 */
const DEFAULT_LLM_SETTINGS: LlmSettings = {
  provider: "openai",
  model: "",
  apiKey: "",
  rating: 1500,
};

interface LlmSettingsState {
  settings: LlmSettings;
  setProvider: (provider: LlmProviderId) => void;
  setModel: (model: string) => void;
  setApiKey: (apiKey: string) => void;
  setRating: (rating: number) => void;
  isConfigured: () => boolean;
}

export const useLlmSettingsStore = create<LlmSettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_LLM_SETTINGS,
      setProvider: (provider) =>
        set((state) => ({ settings: { ...state.settings, provider } })),
      setModel: (model) =>
        set((state) => ({ settings: { ...state.settings, model } })),
      setApiKey: (apiKey) =>
        set((state) => ({ settings: { ...state.settings, apiKey } })),
      setRating: (rating) =>
        set((state) => ({ settings: { ...state.settings, rating } })),
      isConfigured: () => {
        const { provider, model, apiKey } = get().settings;
        return Boolean(provider && model.trim() && apiKey.trim());
      },
    }),
    { name: "chess-book:llm-settings" }
  )
);
