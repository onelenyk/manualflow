export interface DeviceCardProps {
  deviceName: string;
  status: 'ready' | 'not-ready';
  selected?: boolean;
  onClick: () => void;
}

export function DeviceCard({ deviceName, status, selected, onClick }: DeviceCardProps) {
  return (
    <button
      onClick={onClick}
      className={`
        p-6 rounded-xl border-2 transition-all text-left
        ${selected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
        }
      `}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold text-white">{deviceName}</div>
        <div className={`flex items-center gap-1.5 text-xs ${status === 'ready' ? 'text-green-400' : 'text-slate-600'}`}>
          <span className={`w-2 h-2 rounded-full ${status === 'ready' ? 'bg-green-400' : 'bg-slate-600'}`} />
          {status === 'ready' ? 'Ready' : 'Not ready'}
        </div>
      </div>
    </button>
  );
}
