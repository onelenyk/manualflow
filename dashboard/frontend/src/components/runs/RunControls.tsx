export interface RunControlsProps {
  flowName: string;
  status: 'running' | 'paused' | 'passed' | 'failed' | 'stopped';
  startedAt: number;
  finishedAt?: number;
  onBack: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRestart: () => void;
}

export function RunControls({ flowName, status, startedAt, finishedAt, onBack, onPause, onResume, onStop, onRestart }: RunControlsProps) {
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isActive = isRunning || isPaused;
  const isFinished = !isActive;

  const duration = finishedAt
    ? ((finishedAt - startedAt) / 1000).toFixed(1)
    : ((Date.now() - startedAt) / 1000).toFixed(0);

  const statusColor = {
    running: 'text-blue-400',
    paused: 'text-amber-400',
    passed: 'text-green-400',
    failed: 'text-red-400',
    stopped: 'text-yellow-400',
  }[status];

  const statusIcon = {
    running: '●',
    paused: '⏸',
    passed: '✓',
    failed: '✗',
    stopped: '■',
  }[status];

  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-slate-400 hover:text-white transition-colors">
            {'←'} Back
          </button>
          <h2 className="text-sm font-semibold text-white">{flowName}</h2>
          <span className={`text-sm font-mono ${statusColor}`}>
            {statusIcon} {status.toUpperCase()}
          </span>
          <span className="text-xs text-slate-500">{duration}s</span>
        </div>
        <div className="flex items-center gap-2" data-testid="run-controls">
          {isRunning && (
            <button
              onClick={onPause}
              className="px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
            >
              Pause
            </button>
          )}
          {isPaused && (
            <button
              onClick={onResume}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              Resume
            </button>
          )}
          {isActive && (
            <button
              onClick={onStop}
              className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
            >
              Stop
            </button>
          )}
          {isFinished && (
            <button
              onClick={onRestart}
              className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
            >
              Run again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
