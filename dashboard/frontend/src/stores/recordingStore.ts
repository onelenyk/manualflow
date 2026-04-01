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
  startRecording: (deviceSerial?: string, appId?: string) => Promise<void>;
  stopRecording: () => Promise<void>;
  addCommand: (command: CommandDto) => void;
  setYaml: (yaml: string) => void;
  reset: () => void;
}

export const useRecordingStore = create<RecordingStore>((set) => ({
  state: 'idle',
  commands: [],
  yaml: '',
  startTime: null,
  error: null,

  startRecording: async (deviceSerial?: string, appId?: string) => {
    set({ state: 'recording', commands: [], yaml: '', startTime: Date.now(), error: null });
    try {
      await api.startRecording({ deviceSerial, appId });
    } catch (e: any) {
      set({ state: 'idle', error: e.message });
    }
  },

  stopRecording: async () => {
    set({ state: 'stopping' });
    try {
      const result = await api.stopRecording();
      set({ state: 'idle', yaml: result.yaml, commands: result.commands || [] });
    } catch (e: any) {
      set({ state: 'idle', error: e.message });
    }
  },

  addCommand: (command: CommandDto) => {
    set((s) => ({ commands: [...s.commands, command] }));
  },

  setYaml: (yaml: string) => set({ yaml }),

  reset: () => set({ state: 'idle', commands: [], yaml: '', startTime: null, error: null }),
}));
