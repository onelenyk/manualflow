import { useFlowStore } from '../../stores/flowStore';
import { RunControls } from '../runs/RunControls';
import { RunStepList } from '../runs/RunStepList';
import { RunSseStream } from '../runs/RunSseStream';

export function RunViewer() {
  const { activeRun, stopRun, pauseRun, resumeRun, restartRun, clearRun } = useFlowStore();

  if (!activeRun) return null;

  // Cast steps to the narrower StepEntry type — flowStore uses `string` for status
  const steps = activeRun.steps.map(s => ({
    command: s.command,
    status: (s.status as 'running' | 'passed' | 'failed' | 'skipped'),
    error: s.error,
  }));

  return (
    <div className="flex flex-col h-full gap-4">
      <RunControls
        flowName={activeRun.flowName}
        status={activeRun.status}
        startedAt={activeRun.startedAt}
        finishedAt={activeRun.finishedAt}
        onBack={clearRun}
        onPause={pauseRun}
        onResume={resumeRun}
        onStop={stopRun}
        onRestart={() => restartRun()}
      />
      <RunStepList steps={steps} />
      <RunSseStream lines={activeRun.lines} />
    </div>
  );
}
