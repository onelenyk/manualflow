import { create } from 'zustand';
import type { EnhancementResult, RecordedInteraction } from '@maestro-recorder/shared';
import * as aiApi from '../api/ai';

interface EnhancementStore {
  isEnhancing: boolean;
  currentResult: EnhancementResult | null;
  error: string | null;
  enhanceFlow: (yaml: string) => Promise<void>;
  enhanceFromInteractions: (interactions: RecordedInteraction[]) => Promise<void>;
  applyAll: () => string | null;
  clear: () => void;
  setError: (error: string | null) => void;
}

async function runEnhancement(
  fn: () => Promise<EnhancementResult>,
  setState: (state: Partial<EnhancementStore>) => void
): Promise<void> {
  setState({ isEnhancing: true, error: null });
  try {
    const result = await fn();
    setState({ currentResult: result, isEnhancing: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to enhance flow';
    setState({ error: message, isEnhancing: false });
  }
}

export const useEnhancementStore = create<EnhancementStore>((set, get) => ({
  isEnhancing: false,
  currentResult: null,
  error: null,

  enhanceFlow: (yaml: string) => runEnhancement(() => aiApi.enhanceFlow(yaml), set),

  enhanceFromInteractions: (interactions: RecordedInteraction[]) =>
    runEnhancement(() => aiApi.enhanceFromInteractions(interactions), set),

  applyAll: () => get().currentResult?.enhancedYaml || null,

  clear: () => set({ currentResult: null, error: null }),

  setError: (error: string | null) => set({ error }),
}));
