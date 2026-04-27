interface DiffPreviewModalProps {
  beforeYaml: string;
  afterYaml: string;
  changesSummary: string;
  onAccept: () => void;
  onReject: () => void;
}

export function DiffPreviewModal({
  beforeYaml,
  afterYaml,
  changesSummary,
  onAccept,
  onReject,
}: DiffPreviewModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-white">Prettify preview</h3>
        </div>

        <div className="px-4 py-2 text-xs text-slate-300 border-b border-slate-800 shrink-0">
          {changesSummary || 'No summary provided.'}
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 flex-1 overflow-hidden min-h-0">
          <div className="flex flex-col min-h-0">
            <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Before</div>
            <textarea
              readOnly
              value={beforeYaml}
              spellCheck={false}
              className="flex-1 font-mono text-xs bg-slate-950 text-slate-300 p-2 rounded resize-none focus:outline-none border border-slate-800"
            />
          </div>
          <div className="flex flex-col min-h-0">
            <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">After</div>
            <textarea
              readOnly
              value={afterYaml}
              spellCheck={false}
              className="flex-1 font-mono text-xs bg-slate-950 text-slate-200 p-2 rounded resize-none focus:outline-none border border-slate-800"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onReject}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            Reject
          </button>
          <button
            onClick={onAccept}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
