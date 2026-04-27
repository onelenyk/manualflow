import { useEffect } from 'react';
import { useMaestroEditorStore } from '../../stores/maestroEditorStore';
import { useMaestroProjectStore } from '../../stores/maestroProjectStore';
import { SaveConflictModal } from './SaveConflictModal';

export function MaestroFlowEditor() {
  const selectedFilePath = useMaestroProjectStore((s) => s.selectedFilePath);
  const {
    yaml,
    isDraft,
    saving,
    draftSaving,
    conflict,
    loading,
    error,
    dirty,
    load,
    setBuffer,
    save,
    putDraftDebounced,
    discardDraft,
    resolveConflict,
    clear,
  } = useMaestroEditorStore();

  useEffect(() => {
    if (selectedFilePath) {
      load(selectedFilePath);
    } else {
      clear();
    }
  }, [selectedFilePath]);

  if (!selectedFilePath) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-xs text-slate-600">Select a flow from the left.</span>
      </div>
    );
  }

  const fileName = selectedFilePath.split('/').pop() ?? selectedFilePath;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900/60">
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs font-semibold text-slate-200 truncate">{fileName}</span>
          <span className="text-xs text-slate-500 truncate" title={selectedFilePath}>
            {selectedFilePath}
          </span>
        </div>

        {isDraft && (
          <span className="bg-amber-700/40 text-amber-300 px-2 rounded text-xs shrink-0">Draft</span>
        )}

        {isDraft && (
          <button
            onClick={discardDraft}
            disabled={draftSaving}
            className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Discard draft
          </button>
        )}

        <button
          onClick={() => save()}
          disabled={!dirty || saving}
          className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 text-xs text-red-400 bg-red-400/10 px-3 py-2 border-b border-red-900/40">
          {error}
        </div>
      )}

      {/* Editor body */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-slate-500">Loading...</span>
        </div>
      ) : (
        <textarea
          value={yaml}
          onChange={(e) => {
            setBuffer(e.target.value);
            putDraftDebounced();
          }}
          spellCheck={false}
          className="flex-1 font-mono text-xs bg-slate-950 text-slate-200 p-3 rounded-none resize-none focus:outline-none"
        />
      )}

      {/* Conflict modal — non-dismissible, must pick a side */}
      {conflict !== null && (
        <SaveConflictModal conflict={conflict} onPick={resolveConflict} />
      )}
    </div>
  );
}
