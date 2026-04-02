import { create } from 'zustand';
import { api } from '../api/client';
import type { CommandDto } from '../types';

type RecordingState = 'idle' | 'recording' | 'stopping';

interface RecordingStore {
  state: RecordingState;
  commands: CommandDto[];
  yaml: string;
  startTime: number | null;
  error: string | null;
  eventSource: EventSource | null;
  startRecording: (deviceSerial?: string, appId?: string) => Promise<void>;
  stopRecording: () => Promise<void>;
  addCommand: (command: CommandDto) => void;
  setYaml: (yaml: string) => void;
  reset: () => void;
}

export const useRecordingStore = create<RecordingStore>((set, get) => ({
  state: 'idle',
  commands: [],
  yaml: '',
  startTime: null,
  error: null,
  eventSource: null,

  startRecording: async (deviceSerial?: string, appId?: string) => {
    set({ state: 'recording', commands: [], yaml: '', startTime: Date.now(), error: null });
    try {
      await api.startRecording({ deviceSerial, appId });

      // Open SSE connection for real-time command streaming
      const es = new EventSource('/api/recording/events');
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'command' && data.command) {
            get().addCommand(data.command);
          }
        } catch {}
      };
      es.onerror = () => {
        // SSE auto-reconnects
      };
      set({ eventSource: es });
    } catch (e: any) {
      set({ state: 'idle', error: e.message });
    }
  },

  stopRecording: async () => {
    // Close SSE first
    get().eventSource?.close();
    set({ state: 'stopping', eventSource: null });
    try {
      const result = await api.stopRecording();
      set({ state: 'idle', yaml: result.yaml });
    } catch (e: any) {
      set({ state: 'idle', error: e.message });
    }
  },

  addCommand: (command: CommandDto) => {
    set((s) => ({ commands: [...s.commands, command] }));
  },

  setYaml: (yaml: string) => set({ yaml }),

  reset: () => {
    get().eventSource?.close();
    set({ state: 'idle', commands: [], yaml: '', startTime: null, error: null, eventSource: null });
  },
}));
