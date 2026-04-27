import { create } from 'zustand';
import type { MaestroProject } from '@maestro-recorder/shared';
import { api } from '../api/client';

interface MaestroProjectState {
  project: MaestroProject | null;
  recents: string[];
  loading: boolean;
  error: string | null;
  selectedFilePath: string | null;
}

interface MaestroProjectActions {
  hydrate: () => Promise<void>;
  openFolder: (folderPath: string) => Promise<void>;
  refresh: () => Promise<void>;
  selectFile: (path: string | null) => void;
  setError: (error: string | null) => void;
}

export const useMaestroProjectStore = create<MaestroProjectState & MaestroProjectActions>((set, get) => ({
  project: null,
  recents: [],
  loading: false,
  error: null,
  selectedFilePath: null,

  hydrate: async () => {
    set({ loading: true, error: null });
    try {
      const { project, recents } = await api.getMaestroProject();
      set({ project, recents, selectedFilePath: null, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  openFolder: async (folderPath: string) => {
    set({ loading: true, error: null });
    try {
      const project = await api.openMaestroProject(folderPath);
      set({ project, selectedFilePath: null, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const { project, recents } = await api.getMaestroProject();
      const prev = get().selectedFilePath;
      // Keep selectedFilePath only if the file still exists in the refreshed project
      const stillExists = prev !== null && project !== null && project.files.some(f => f.path === prev);
      set({ project, recents, selectedFilePath: stillExists ? prev : null, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  selectFile: (path: string | null) => set({ selectedFilePath: path }),

  setError: (error: string | null) => set({ error }),
}));
