import { useRef, useEffect } from 'react';
import { useFlowStore } from '../../stores/flowStore';

export function RunViewer() {
  const { activeRun, stopRun, pauseRun, resumeRun, restartRun, clearRun } = useFlowStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeRun?.lines.length, activeRun?.steps.length]);

  if (!activeRun) return null;

  const isRunning = activeRun.status === 'running';
  const isPaused = activeRun.status === 'paused';
  const isActive = isRunning || isPaused;
  const isFinished = !isActive;

  const duration = activeRun.finishedAt
    ? ((activeRun.finishedAt - activeRun.startedAt) / 1000).toFixed(1)
    : ((Date.now() - activeRun.startedAt) / 1000).toFixed(0);

  const statusColor = {
    running: 'text-blue-400',
    paused: 'text-amber-400',
    passed: 'text-green-400',
    failed: 'text-red-400',
    stopped: 'text-yellow-400',
  }[activeRun.status];

  const statusIcon = {
    running: '\u25CF',
    paused: '\u23F8',
    passed: '\u2713',
    failed: '\u2717',
    stopped: '\u25A0',
  }[activeRun.status];

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={clearRun} className="text-sm text-slate-400 hover:text-white transition-colors">
              {'\u2190'} Back
            </button>
            <h2 className="text-sm font-semibold text-white">{activeRun.flowName}</h2>
            <span className={`text-sm font-mono ${statusColor}`}>
              {statusIcon} {activeRun.status.toUpperCase()}
            </span>
            <span className="text-xs text-slate-500">{duration}s</span>
          </div>
          <div className="flex items-center gap-2" data-testid="run-controls">
            {isRunning && (
              <button
                onClick={pauseRun}
                className="px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
              >
                Pause
              </button>
            )}
            {isPaused && (
              <button
                onClick={resumeRun}
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                Resume
              </button>
            )}
            {isActive && (
              <button
                onClick={stopRun}
                className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
              >
                Stop
              </button>
            )}
            {isFinished && (
              <button
                onClick={() => restartRun()}
                className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
              >
                Run again
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Steps</h3>
        {activeRun.steps.length === 0 ? (
          <div className="text-xs text-slate-600">Waiting for steps...</div>
        ) : (
          <div className="flex flex-col gap-1">
            {activeRun.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`w-4 text-center ${
                  step.status === 'passed' ? 'text-green-400' :
                  step.status === 'failed' ? 'text-red-400' :
                  step.status === 'running' ? 'text-blue-400 animate-pulse' :
                  'text-slate-600'
                }`}>
                  {step.status === 'passed' ? '\u2713' :
                   step.status === 'failed' ? '\u2717' :
                   step.status === 'running' ? '\u25CF' : '\u25CB'}
                </span>
                <span className={`font-mono ${step.status === 'failed' ? 'text-red-300' : 'text-slate-300'}`}>
                  {step.command}
                </span>
                {step.error && (
                  <span className="text-red-400 text-[11px] ml-2">{step.error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Raw output */}
      <div className="flex-1 min-h-0 bg-slate-900/60 rounded-xl border border-slate-800 p-4 overflow-auto">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 sticky top-0 bg-slate-900/60">Output</h3>
        <div className="font-mono text-[11px] text-slate-400 leading-relaxed">
          {activeRun.lines.map((line, i) => (
            <div key={i} className="hover:bg-slate-800/50 px-1">{line}</div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
