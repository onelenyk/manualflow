import type { RunState } from '../../stores/flowStore';
import { RunControls } from '../runs/RunControls';
import { RunStepList } from '../runs/RunStepList';
import { RunSseStream } from '../runs/RunSseStream';

export interface MaestroRunViewerProps {
  run: RunState | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRestart: () => void;
  onBack: () => void;
}

export function MaestroRunViewer({ run, onPause, onResume, onStop, onRestart, onBack }: MaestroRunViewerProps) {
  if (run === null) {
    return (
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
        <span className="text-slate-500 text-sm">Select a flow and click Run to start a Maestro run.</span>
      </div>
    );
  }

  const steps = run.steps.map(s => ({
    command: s.command,
    status: (s.status as 'running' | 'passed' | 'failed' | 'skipped'),
    error: s.error,
  }));

  return (
    <div className="flex flex-col h-full gap-4">
      <RunControls
        flowName={run.flowName}
        status={run.status}
        startedAt={run.startedAt}
        finishedAt={run.finishedAt}
        onBack={onBack}
        onPause={onPause}
        onResume={onResume}
        onStop={onStop}
        onRestart={onRestart}
      />
      <RunStepList steps={steps} />
      <RunSseStream lines={run.lines} />
    </div>
  );
}
