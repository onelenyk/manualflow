import { create } from 'zustand';
import { api } from '../api/client';

interface EditorBuffer {
  path: string;
  yaml: string;
  baseSha: string;
  isDraft: boolean;
  saving: boolean;
  draftSaving: boolean;
  conflict: { disk: string; attempted: string; baseSha: string } | null;
  loading: boolean;
  error: string | null;
  dirty: boolean;
}

interface EditorActions {
  load: (path: string) => Promise<void>;
  setBuffer: (yaml: string) => void;
  save: (overwrite?: boolean) => Promise<void>;
  putDraftDebounced: () => void;
  discardDraft: () => Promise<void>;
  resolveConflict: (pick: 'disk' | 'attempted') => Promise<void>;
  clear: () => void;
}

const initialState: EditorBuffer = {
  path: '',
  yaml: '',
  baseSha: '',
  isDraft: false,
  saving: false,
  draftSaving: false,
  conflict: null,
  loading: false,
  error: null,
  dirty: false,
};

// Module-scoped timer ref for debounced draft saves
let draftTimer: ReturnType<typeof setTimeout> | null = null;

export const useMaestroEditorStore = create<EditorBuffer & EditorActions>((set, get) => ({
  ...initialState,

  load: async (path: string) => {
    set({ loading: true, error: null, path });
    try {
      const res = await api.getMaestroFlow(path);
      if (res.draft) {
        // Draft present: load draft content so user continues from where they left off
        set({
          yaml: res.draft.yaml,
          baseSha: res.draft.sha,
          isDraft: true,
          dirty: false,
          conflict: null,
          loading: false,
        });
      } else {
        set({
          yaml: res.yaml,
          baseSha: res.sha,
          isDraft: false,
          dirty: false,
          conflict: null,
          loading: false,
        });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  setBuffer: (yaml: string) => {
    set({ yaml, dirty: true });
  },

  save: async (overwrite?: boolean) => {
    const { path, yaml, baseSha } = get();
    set({ saving: true });
    try {
      await api.saveMaestroFlow({ path, yaml, expectedSha: baseSha, overwrite: overwrite ?? false });
      // Refetch to get canonical sha and clear draft state
      const fresh = await api.getMaestroFlow(path);
      set({
        baseSha: fresh.sha,
        yaml: fresh.yaml,
        isDraft: false,
        dirty: false,
        conflict: null,
        saving: false,
      });
    } catch (e: any) {
      if (e.message === 'sha-mismatch') {
        // Re-fetch disk state to populate conflict details
        try {
          const fresh = await api.getMaestroFlow(path);
          set({
            conflict: { disk: fresh.yaml, attempted: yaml, baseSha: fresh.sha },
            saving: false,
          });
        } catch {
          set({ error: 'Conflict detected but could not fetch disk state.', saving: false });
        }
      } else {
        set({ error: e.message, saving: false });
      }
    }
  },

  putDraftDebounced: () => {
    const { dirty } = get();
    if (!dirty) return;

    if (draftTimer !== null) {
      clearTimeout(draftTimer);
    }
    set({ draftSaving: true });
    draftTimer = setTimeout(async () => {
      draftTimer = null;
      const { path, yaml } = get();
      try {
        await api.putMaestroDraft(path, yaml);
        set({ isDraft: true, draftSaving: false });
      } catch {
        set({ draftSaving: false });
      }
    }, 800);
  },

  discardDraft: async () => {
    const { path } = get();
    try {
      await api.deleteMaestroDraft(path);
    } catch {
      // If draft delete fails, still reload from disk
    }
    await get().load(path);
  },

  resolveConflict: async (pick: 'disk' | 'attempted') => {
    const { conflict } = get();
    if (!conflict) return;

    if (pick === 'disk') {
      // User picks disk: abandon their edit
      set({
        yaml: conflict.disk,
        baseSha: conflict.baseSha,
        dirty: false,
        conflict: null,
        isDraft: false,
      });
    } else {
      // User picks their edit: save with overwrite using latest disk sha as base
      set({ baseSha: conflict.baseSha, yaml: conflict.attempted, conflict: null });
      await get().save(true);
    }
  },

  clear: () => {
    if (draftTimer !== null) {
      clearTimeout(draftTimer);
      draftTimer = null;
    }
    set({ ...initialState });
  },
}));
