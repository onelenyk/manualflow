import { useState } from 'react';

export interface ExtractSubflow {
  name: string;
  yaml: string;
  sourceFlows: string[];
}

export interface ExtractRefactor {
  flowPath: string;
  before: string;
  after: string;
  reason: string;
}

interface ExtractReviewScreenProps {
  subflows: ExtractSubflow[];
  refactors: ExtractRefactor[];
  onApply: (selection: {
    selectedSubflows: ExtractSubflow[];
    selectedRefactors: ExtractRefactor[];
  }) => Promise<void> | void;
  onCancel: () => void;
}

export function ExtractReviewScreen({
  subflows,
  refactors,
  onApply,
  onCancel,
}: ExtractReviewScreenProps) {
  const [selectedSubs, setSelectedSubs] = useState<Record<number, boolean>>(
    Object.fromEntries(subflows.map((_, i) => [i, true])),
  );
  const [selectedRefs, setSelectedRefs] = useState<Record<number, boolean>>(
    Object.fromEntries(refactors.map((_, i) => [i, true])),
  );
  const [applying, setApplying] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const toggleSub = (i: number) => setSelectedSubs((s) => ({ ...s, [i]: !s[i] }));
  const toggleRef = (i: number) => setSelectedRefs((s) => ({ ...s, [i]: !s[i] }));

  const handleApply = async () => {
    setApplying(true);
    setErrMsg(null);
    try {
      await onApply({
        selectedSubflows: subflows.filter((_, i) => selectedSubs[i]),
        selectedRefactors: refactors.filter((_, i) => selectedRefs[i]),
      });
    } catch (e: any) {
      setErrMsg(e?.message ?? 'Failed to apply');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 shrink-0">
          <h3 className="text-sm font-semibold text-white">Extract Common — Review</h3>
        </div>

        <div className="flex-1 overflow-auto p-4 flex flex-col gap-4 min-h-0">
          <section>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Subflows ({subflows.length})
            </h4>
            {subflows.length === 0 ? (
              <div className="text-xs text-slate-500">No subflows proposed.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {subflows.map((sf, i) => (
                  <label
                    key={i}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-2 cursor-pointer hover:border-slate-700"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!selectedSubs[i]}
                        onChange={() => toggleSub(i)}
                      />
                      <span className="text-xs font-semibold text-slate-200">{sf.name}.yaml</span>
                      <span className="text-xs text-slate-500">
                        used in {sf.sourceFlows.length} flow{sf.sourceFlows.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <pre className="font-mono text-[11px] text-slate-300 bg-slate-900 p-2 rounded overflow-auto max-h-40">
                      {sf.yaml}
                    </pre>
                    {sf.sourceFlows.length > 0 && (
                      <div className="text-[11px] text-slate-500">
                        Sources: {sf.sourceFlows.join(', ')}
                      </div>
                    )}
                  </label>
                ))}
              </div>
            )}
          </section>

          <section>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Refactors ({refactors.length})
            </h4>
            {refactors.length === 0 ? (
              <div className="text-xs text-slate-500">No refactors proposed.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {refactors.map((rf, i) => (
                  <label
                    key={i}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-2 cursor-pointer hover:border-slate-700"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!selectedRefs[i]}
                        onChange={() => toggleRef(i)}
                      />
                      <span className="text-xs font-semibold text-slate-200">{rf.flowPath}</span>
                    </div>
                    {rf.reason && (
                      <div className="text-[11px] text-slate-400">{rf.reason}</div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-500 uppercase">Before</span>
                        <pre className="font-mono text-[11px] text-slate-400 bg-slate-900 p-2 rounded overflow-auto max-h-40">
                          {rf.before}
                        </pre>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-500 uppercase">After</span>
                        <pre className="font-mono text-[11px] text-slate-200 bg-slate-900 p-2 rounded overflow-auto max-h-40">
                          {rf.after}
                        </pre>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </section>

          {errMsg && (
            <div className="text-xs text-red-300 bg-red-900/30 border border-red-800/40 rounded px-3 py-2">
              {errMsg}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onCancel}
            disabled={applying}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={applying}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
          >
            {applying ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
