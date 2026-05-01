import { useMaestroRunStore } from '../../../../stores/maestroRunStore';

export interface RunResultsStepProps {
  onRunAgain: () => void;
  onEdit: () => void;
}

export function RunResultsStep({ onRunAgain, onEdit }: RunResultsStepProps) {
  const activeRun = useMaestroRunStore((s) => s.active);

  if (!activeRun) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-500">No run data available</div>
      </div>
    );
  }

  const isPassed = activeRun.status === 'passed';
  const isFailed = activeRun.status === 'failed';

  // Calculate duration
  const duration = activeRun.finishedAt
    ? Math.round((activeRun.finishedAt - activeRun.startedAt) / 1000)
    : null;

  // Find failed step if any
  const failedStep = activeRun.steps.find((s) => s.status === 'failed');

  return (
    <div className="space-y-6 text-center">
      {/* Large status */}
      <div>
        <div
          className={`text-4xl font-bold mb-2 ${
            isPassed ? 'text-green-400' : isFailed ? 'text-red-400' : 'text-slate-400'
          }`}
        >
          {isPassed ? 'PASSED' : isFailed ? 'FAILED' : 'STOPPED'}
        </div>

        {isFailed && failedStep && (
          <div className="text-sm text-red-400">
            Step {activeRun.steps.indexOf(failedStep) + 1} failed: {failedStep.error || 'Unknown error'}
          </div>
        )}

        {duration && (
          <div className="text-sm text-slate-500 mt-2">Completed in {duration} seconds</div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onRunAgain}
          className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-base font-medium rounded-lg transition-all active:scale-95 min-h-[48px]"
        >
          Run again
        </button>
        <button
          onClick={onEdit}
          className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white text-base font-medium rounded-lg transition-all active:scale-95 min-h-[48px]"
        >
          Edit this test
        </button>
      </div>

      {/* Step summary */}
      {activeRun.steps.length > 0 && (
        <div className="mt-6 p-4 bg-slate-800 rounded-lg">
          <div className="text-sm font-medium text-white mb-2">Test steps</div>
          <div className="space-y-1 text-left max-h-40 overflow-y-auto">
            {activeRun.steps.map((step, idx) => (
              <div key={idx} className="text-xs flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    step.status === 'passed'
                      ? 'bg-green-400'
                      : step.status === 'failed'
                      ? 'bg-red-400'
                      : 'bg-slate-600'
                  }`}
                />
                <span className="text-slate-400 flex-1 truncate">{step.command}</span>
                {step.status === 'passed' && <span className="text-green-400">✓</span>}
                {step.status === 'failed' && <span className="text-red-400">✗</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
