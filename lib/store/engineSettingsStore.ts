import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AnalysisSource = "cloud" | "local";

export interface EngineSettings {
  /**
   * Where position evaluation comes from: Lichess's Cloud Evaluation API
   * (a lookup against community-contributed analysis, no local computation)
   * or Stockfish running locally in a Web Worker. Defaults to "cloud" — it
   * needs no WASM/worker loading, which has been the source of most local
   * engine issues; local remains available for positions Lichess hasn't
   * cached (a real gap for deep/obscure book lines).
   */
  analysisSource: AnalysisSource;
  /** UCI `go depth N`. Local engine only. */
  depth: number;
  /** UCI `setoption name MultiPV value N` / cloud-eval `multiPv` param. Used by both sources. */
  multiPv: number;
  /** UCI `setoption name Threads value N`. Only applied when the multi-thread build is active. */
  threads: number;
  /** UCI `setoption name Hash value N` (MB). Local engine only. */
  hashMb: number;
  /**
   * User preference to use the multi-threaded WASM build when the browser
   * supports it (`self.crossOriginIsolated`). Falls back to the
   * lite-single-threaded build otherwise, regardless of this flag.
   */
  useMultiThreadIfAvailable: boolean;
}

const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  analysisSource: "cloud",
  depth: 18,
  multiPv: 1,
  threads: 1,
  hashMb: 16,
  useMultiThreadIfAvailable: false,
};

interface EngineSettingsState {
  settings: EngineSettings;
  setAnalysisSource: (source: AnalysisSource) => void;
  setDepth: (depth: number) => void;
  setMultiPv: (multiPv: number) => void;
  setThreads: (threads: number) => void;
  setHashMb: (hashMb: number) => void;
  setUseMultiThreadIfAvailable: (value: boolean) => void;
  reset: () => void;
}

export const useEngineSettingsStore = create<EngineSettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_ENGINE_SETTINGS,
      setAnalysisSource: (analysisSource) =>
        set((state) => ({ settings: { ...state.settings, analysisSource } })),
      setDepth: (depth) =>
        set((state) => ({ settings: { ...state.settings, depth } })),
      setMultiPv: (multiPv) =>
        set((state) => ({ settings: { ...state.settings, multiPv } })),
      setThreads: (threads) =>
        set((state) => ({ settings: { ...state.settings, threads } })),
      setHashMb: (hashMb) =>
        set((state) => ({ settings: { ...state.settings, hashMb } })),
      setUseMultiThreadIfAvailable: (useMultiThreadIfAvailable) =>
        set((state) => ({
          settings: { ...state.settings, useMultiThreadIfAvailable },
        })),
      reset: () => set({ settings: DEFAULT_ENGINE_SETTINGS }),
    }),
    {
      name: "chess-book:engine-settings",
      // Existing localStorage values from before `analysisSource` existed
      // won't have it — merge over the defaults instead of replacing them
      // wholesale, so old persisted settings don't end up missing the field.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<EngineSettingsState> | undefined;
        return {
          ...currentState,
          ...persisted,
          settings: { ...currentState.settings, ...persisted?.settings },
        };
      },
    }
  )
);
