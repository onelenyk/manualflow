export interface TestCardProps {
  testName: string;
  lastRunStatus?: 'passed' | 'failed' | 'never';
  lastRunTime?: string;
  onClick?: () => void;
  onRunAction?: () => void;
}

export function TestCard({ testName, lastRunStatus = 'never', lastRunTime, onClick, onRunAction }: TestCardProps) {
  const getStatusIcon = () => {
    switch (lastRunStatus) {
      case 'passed':
        return <span className="text-green-400">✓</span>;
      case 'failed':
        return <span className="text-red-400">✗</span>;
      default:
        return <span className="text-slate-600">−</span>;
    }
  };

  return (
    <button
      onClick={onClick}
      className="p-6 rounded-xl border-2 border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-all text-left w-full"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="text-lg font-semibold text-white">{testName}</div>
        {getStatusIcon()}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {lastRunTime ? `Last run: ${lastRunTime}` : 'Never run'}
        </div>

        {onRunAction && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRunAction();
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-all active:scale-95"
          >
            Run this test
          </button>
        )}
      </div>
    </button>
  );
}
