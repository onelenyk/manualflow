import { create } from 'zustand';
import { api } from '../api/client';
import type { FlowDto } from '../types';

interface FlowStore {
  flows: FlowDto[];
  loading: boolean;
  error: string | null;
  fetchFlows: () => Promise<void>;
  deleteFlow: (id: string) => Promise<void>;
}

export const useFlowStore = create<FlowStore>((set) => ({
  flows: [],
  loading: false,
  error: null,

  fetchFlows: async () => {
    set({ loading: true, error: null });
    try {
      const flows = await api.getFlows();
      set({ flows, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  deleteFlow: async (id: string) => {
    await api.deleteFlow(id);
    set((s) => ({ flows: s.flows.filter((f) => f.id !== id) }));
  },
}));
