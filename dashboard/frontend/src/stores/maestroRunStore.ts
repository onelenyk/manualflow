import { create } from 'zustand';
import { api } from '../api/client';

export type MaestroRunStatus = 'running' | 'paused' | 'passed' | 'failed' | 'stopped';

export interface MaestroRunStep {
  command: string;
  status: 'running' | 'passed' | 'failed' | 'skipped';
  durationMs?: number;
  error?: string;
}

export interface MaestroRunState {
  id: string;
  flowId: string;
  flowName: string;
  flowPath: string;
  status: MaestroRunStatus;
  startedAt: number;
  finishedAt?: number;
  steps: MaestroRunStep[];
  lines: string[];
}

interface RunStore {
  active: MaestroRunState | null;
  starting: boolean;
  error: string | null;
  start: (flowPath: string, deviceSerial?: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  clear: () => void;
}

// Module-scoped EventSource ref so pause/resume/stop don't reopen it
let activeEs: EventSource | null = null;
let lastDeviceSerial: string | undefined;

function closeEs() {
  if (activeEs) {
    try { activeEs.close(); } catch {}
    activeEs = null;
  }
}

function basenameOf(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.slice(idx + 1) : p;
}

export const useMaestroRunStore = create<RunStore>((set, get) => ({
  active: null,
  starting: false,
  error: null,

  start: async (flowPath: string, deviceSerial?: string) => {
    if (get().starting || get().active) return;
    set({ starting: true, error: null });
    lastDeviceSerial = deviceSerial;
    try {
      const run: any = await api.startMaestroRun(flowPath, deviceSerial);
      const initial: MaestroRunState = {
        id: run.id,
        flowId: run.flowId ?? flowPath,
        flowName: run.flowName ?? basenameOf(flowPath),
        flowPath,
        status: (run.status as MaestroRunStatus) ?? 'running',
        startedAt: run.startedAt ?? Date.now(),
        finishedAt: run.finishedAt,
        steps: Array.isArray(run.steps) ? run.steps : [],
        lines: Array.isArray(run.lines) ? run.lines : [],
      };
      set({ active: initial, starting: false });

      closeEs();
      const es = new EventSource(`/api/runs/${initial.id}/stream`);
      activeEs = es;
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === 'line') {
            set((s) =>
              s.active ? { active: { ...s.active, lines: [...s.active.lines, data.line] } } : {},
            );
          } else if (data.type === 'steps') {
            set((s) => (s.active ? { active: { ...s.active, steps: data.steps } } : {}));
          } else if (data.type === 'done') {
            const done = data.run ?? {};
            set((s) =>
              s.active
                ? {
                    active: {
                      ...s.active,
                      status: (done.status as MaestroRunStatus) ?? s.active.status,
                      finishedAt: done.finishedAt ?? Date.now(),
                      steps: Array.isArray(done.steps) ? done.steps : s.active.steps,
                      lines: Array.isArray(done.lines) ? done.lines : s.active.lines,
                    },
                  }
                : {},
            );
            closeEs();
          }
        } catch {}
      };
      es.onerror = () => {
        closeEs();
      };
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to start run', starting: false });
    }
  },

  pause: async () => {
    const run = get().active;
    if (!run || run.status !== 'running') return;
    try {
      const res = await fetch(`/api/runs/${run.id}/pause`, { method: 'POST' });
      if (!res.ok) throw new Error(`pause failed: ${res.status}`);
      set((s) => (s.active ? { active: { ...s.active, status: 'paused' } } : {}));
    } catch (e: any) {
      set({ error: e?.message ?? 'pause failed' });
    }
  },

  resume: async () => {
    const run = get().active;
    if (!run || run.status !== 'paused') return;
    try {
      const res = await fetch(`/api/runs/${run.id}/resume`, { method: 'POST' });
      if (!res.ok) throw new Error(`resume failed: ${res.status}`);
      set((s) => (s.active ? { active: { ...s.active, status: 'running' } } : {}));
    } catch (e: any) {
      set({ error: e?.message ?? 'resume failed' });
    }
  },

  stop: async () => {
    const run = get().active;
    if (!run) return;
    try {
      await fetch(`/api/runs/${run.id}`, { method: 'DELETE' });
      set((s) => (s.active ? { active: { ...s.active, status: 'stopped' } } : {}));
    } catch (e: any) {
      set({ error: e?.message ?? 'stop failed' });
    }
  },

  restart: async () => {
    const run = get().active;
    if (!run) return;
    const flowPath = run.flowPath;
    closeEs();
    set({ active: null, error: null });
    await get().start(flowPath, lastDeviceSerial);
  },

  clear: () => {
    closeEs();
    set({ active: null, error: null });
  },
}));
