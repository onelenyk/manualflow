interface StatusCardProps {
  title: string;
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  children: React.ReactNode;
  actions?: React.ReactNode;
}

const statusStyles = {
  healthy: 'border-emerald-500/50 bg-emerald-950/30',
  warning: 'border-amber-500/50 bg-amber-950/30',
  error: 'border-red-500/50 bg-red-950/30',
  unknown: 'border-slate-700 bg-slate-900',
};

const statusIndicators = {
  healthy: <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />,
  warning: <span className="w-2 h-2 rounded-full bg-amber-500" />,
  error: <span className="w-2 h-2 rounded-full bg-red-500" />,
  unknown: <span className="w-2 h-2 rounded-full bg-slate-600" />,
};

export function StatusCard({ title, status, children, actions }: StatusCardProps) {
  return (
    <div className={`border rounded-lg p-4 ${statusStyles[status]}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {statusIndicators[status]}
          <h3 className="font-semibold text-sm text-slate-200">{title}</h3>
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
