interface SaveConflictModalProps {
  conflict: { disk: string; attempted: string; baseSha: string };
  onPick: (pick: 'disk' | 'attempted') => void;
}

export function SaveConflictModal({ conflict, onPick }: SaveConflictModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-5xl flex flex-col gap-4 p-6 max-h-[90vh]">
        <div className="flex flex-col gap-1 shrink-0">
          <h2 className="text-sm font-semibold text-white">Save conflict — disk changed under you</h2>
          <p className="text-xs text-slate-400">
            Another process modified this file after you loaded it. You must pick one version to continue.
          </p>
        </div>

        <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col flex-1 gap-1 min-h-0">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider shrink-0">Disk</span>
            <textarea
              readOnly
              value={conflict.disk}
              className="flex-1 font-mono text-xs bg-slate-950 text-slate-200 p-3 rounded border border-slate-700 resize-none min-h-[300px]"
            />
          </div>
          <div className="flex flex-col flex-1 gap-1 min-h-0">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider shrink-0">Your edit</span>
            <textarea
              readOnly
              value={conflict.attempted}
              className="flex-1 font-mono text-xs bg-slate-950 text-slate-200 p-3 rounded border border-slate-700 resize-none min-h-[300px]"
            />
          </div>
        </div>

        <div className="flex gap-3 shrink-0 justify-end">
          <button
            onClick={() => onPick('disk')}
            className="px-4 py-2 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Keep disk
          </button>
          <button
            onClick={() => onPick('attempted')}
            className="px-4 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            Overwrite with mine
          </button>
        </div>
      </div>
    </div>
  );
}
