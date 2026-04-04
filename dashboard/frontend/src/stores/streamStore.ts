import { create } from 'zustand';

interface Interaction {
  id: number;
  source: string;
  status: string;
  timestampMs: number;
  touchAction?: any;
  element?: any;
  accessibilityEvents: any[];
  keyboardState?: any;
  filteredAsKeyboardTap: boolean;
  screenWidth: number;
  screenHeight: number;
}

interface StreamStore {
  connected: boolean;
  interactions: Interaction[];
  selectedIds: Set<number>;
  yaml: string;
  exporting: boolean;
  error: string | null;
  eventSource: EventSource | null;

  // Connection
  connectSSE: () => void;
  disconnectSSE: () => void;

  // Selection
  toggleSelect: (id: number) => void;
  selectAll: () => void;
  selectNone: () => void;
  selectRange: (fromId: number, toId: number) => void;

  // Actions
  exportYaml: (appId: string) => Promise<void>;
  clearInteractions: () => Promise<void>;
  reconnect: () => Promise<void>;
}

export const useStreamStore = create<StreamStore>((set, get) => ({
  connected: false,
  interactions: [],
  selectedIds: new Set(),
  yaml: '',
  exporting: false,
  error: null,
  eventSource: null,

  connectSSE: () => {
    // Close existing
    get().eventSource?.close();

    const es = new EventSource('/api/stream/interactions');

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const interaction = data.interaction as Interaction | undefined;

        if (data.type === 'connected') {
          set({ connected: true });
          return;
        }
        if (data.type === 'disconnected') {
          set({ connected: false });
          return;
        }
        if (!interaction) return;

        if (data.type === 'interaction:created') {
          set(s => ({
            interactions: [...s.interactions, interaction],
            connected: true,
          }));
        } else if (data.type === 'interaction:updated') {
          set(s => ({
            interactions: s.interactions.map(i => i.id === interaction.id ? interaction : i),
          }));
        } else if (data.type === 'interaction:complete') {
          set(s => {
            const exists = s.interactions.some(i => i.id === interaction.id);
            if (exists) {
              return { interactions: s.interactions.map(i => i.id === interaction.id ? interaction : i) };
            }
            return { interactions: [...s.interactions, interaction] };
          });
        }
      } catch {}
    };

    es.onerror = () => {
      // SSE auto-reconnects
    };

    set({ eventSource: es });

    // Also check initial status
    fetch('/api/stream/status')
      .then(r => r.json())
      .then(data => set({ connected: data.connected }))
      .catch(() => {});
  },

  disconnectSSE: () => {
    get().eventSource?.close();
    set({ eventSource: null });
  },

  toggleSelect: (id: number) => {
    set(s => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    });
  },

  selectAll: () => {
    set(s => ({
      selectedIds: new Set(
        s.interactions
          .filter(i => !i.filteredAsKeyboardTap && i.status === 'complete')
          .map(i => i.id)
      ),
    }));
  },

  selectNone: () => {
    set({ selectedIds: new Set() });
  },

  selectRange: (fromId: number, toId: number) => {
    set(s => {
      const ids = s.interactions
        .filter(i => !i.filteredAsKeyboardTap && i.status === 'complete')
        .filter(i => i.id >= fromId && i.id <= toId)
        .map(i => i.id);
      return { selectedIds: new Set(ids) };
    });
  },

  exportYaml: async (appId: string) => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return;

    set({ exporting: true, error: null });
    try {
      const res = await fetch('/api/stream/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, interactionIds: [...selectedIds] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(err.error);
      }
      const data = await res.json();
      set({ yaml: data.yaml, exporting: false });
    } catch (e: any) {
      set({ error: e.message, exporting: false });
    }
  },

  clearInteractions: async () => {
    try {
      await fetch('/api/stream/clear', { method: 'POST' });
      set({ interactions: [], selectedIds: new Set(), yaml: '' });
    } catch {}
  },

  reconnect: async () => {
    try {
      await fetch('/api/stream/reconnect', { method: 'POST' });
    } catch {}
  },
}));
