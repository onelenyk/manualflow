import { create } from 'zustand';
import { api } from '../api/client';

export interface FlowMeta {
  id: string;
  name: string;
  commandCount: number;
  createdAt: number;
  updatedAt?: number;
}

export interface FlowDetail {
  id: string;
  name: string;
  yaml: string;
  commandCount: number;
}

export type RunStatus = 'running' | 'paused' | 'passed' | 'failed' | 'stopped';

export interface RunState {
  id: string;
  flowId: string;
  flowName: string;
  status: RunStatus;
  startedAt: number;
  finishedAt?: number;
  pausedAt?: number;
  pausedElapsedMs?: number;
  lines: string[];
  steps: { command: string; status: string; error?: string }[];
  exitCode?: number;
}

interface FlowStore {
  flows: FlowMeta[];
  loading: boolean;
  error: string | null;
  activeRun: RunState | null;
  editingFlow: FlowDetail | null;

  fetchFlows: () => Promise<void>;
  saveFlow: (name: string, yaml: string) => Promise<FlowMeta>;
  deleteFlow: (id: string) => Promise<void>;
  duplicateFlow: (id: string, name: string) => Promise<void>;
  loadFlow: (id: string) => Promise<void>;
  updateFlow: (id: string, patch: { name?: string; yaml?: string }) => Promise<void>;
  closeEditor: () => void;

  runFlow: (flowId: string) => Promise<void>;
  runFlowOnDevice: (flowId: string, deviceSerial?: string) => Promise<void>;
  stopRun: () => Promise<void>;
  pauseRun: () => Promise<void>;
  resumeRun: () => Promise<void>;
  restartRun: (deviceSerial?: string) => Promise<void>;
  clearRun: () => void;
}

export const useFlowStore = create<FlowStore>((set, get) => ({
  flows: [],
  loading: false,
  error: null,
  activeRun: null,
  editingFlow: null,

  fetchFlows: async () => {
    set({ loading: true, error: null });
    try {
      const flows = await api.getFlows();
      set({ flows, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  saveFlow: async (name: string, yaml: string) => {
    const meta = await api.saveFlow({ name, yaml });
    await get().fetchFlows();
    return meta;
  },

  deleteFlow: async (id: string) => {
    await api.deleteFlow(id);
    set(s => ({ flows: s.flows.filter(f => f.id !== id) }));
  },

  duplicateFlow: async (id: string, name: string) => {
    await api.duplicateFlow(id, name);
    await get().fetchFlows();
  },

  loadFlow: async (id: string) => {
    try {
      const flow = await api.getFlow(id);
      set({ editingFlow: flow });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  updateFlow: async (id: string, patch: { name?: string; yaml?: string }) => {
    await api.updateFlow(id, patch);
    await get().fetchFlows();
    // Refresh editor if open
    if (get().editingFlow?.id === id) {
      const flow = await api.getFlow(id);
      set({ editingFlow: flow });
    }
  },

  closeEditor: () => set({ editingFlow: null }),

  runFlow: async (flowId: string) => {
    return get().runFlowOnDevice(flowId);
  },

  runFlowOnDevice: async (flowId: string, deviceSerial?: string) => {
    try {
      const run = await api.startRun(flowId, deviceSerial);
      set({ activeRun: run });

      // Connect SSE for live updates
      const es = new EventSource(`/api/runs/${run.id}/stream`);
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === 'line') {
            set(s => s.activeRun ? { activeRun: { ...s.activeRun, lines: [...s.activeRun.lines, data.line] } } : {});
          } else if (data.type === 'steps') {
            set(s => s.activeRun ? { activeRun: { ...s.activeRun, steps: data.steps } } : {});
          } else if (data.type === 'done') {
            set({ activeRun: data.run });
            es.close();
          }
        } catch {}
      };
      es.onerror = () => es.close();
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  stopRun: async () => {
    const run = get().activeRun;
    if (run) {
      await api.stopRun(run.id);
      set(s => s.activeRun ? { activeRun: { ...s.activeRun, status: 'stopped' } } : {});
    }
  },

  pauseRun: async () => {
    const run = get().activeRun;
    if (!run || run.status !== 'running') return;
    try {
      const updated = await api.pauseRun(run.id);
      set(s => s.activeRun ? { activeRun: { ...s.activeRun, ...updated } } : {});
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  resumeRun: async () => {
    const run = get().activeRun;
    if (!run || run.status !== 'paused') return;
    try {
      const updated = await api.resumeRun(run.id);
      set(s => s.activeRun ? { activeRun: { ...s.activeRun, ...updated } } : {});
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  restartRun: async (deviceSerial?: string) => {
    const run = get().activeRun;
    if (!run) return;
    const flowId = run.flowId;
    set({ activeRun: null });
    await get().runFlowOnDevice(flowId, deviceSerial);
  },

  clearRun: () => set({ activeRun: null }),
}));
