export interface StepEntry {
  command: string;
  status: 'running' | 'passed' | 'failed' | 'skipped';
  durationMs?: number;
  error?: string;
}

export interface RunStepListProps {
  steps: StepEntry[];
}

export function RunStepList({ steps }: RunStepListProps) {
  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Steps</h3>
      {steps.length === 0 ? (
        <div className="text-xs text-slate-600">Waiting for steps...</div>
      ) : (
        <div className="flex flex-col gap-1">
          {steps.map((step, i) => {
            let iconColor = 'text-slate-600';
            let icon = '○';
            if (step.status === 'passed') { iconColor = 'text-green-400'; icon = '✓'; }
            else if (step.status === 'failed') { iconColor = 'text-red-400'; icon = '✗'; }
            else if (step.status === 'running') { iconColor = 'text-blue-400 animate-pulse'; icon = '●'; }

            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`w-4 text-center ${iconColor}`}>{icon}</span>
                <span className={`font-mono ${step.status === 'failed' ? 'text-red-300' : 'text-slate-300'}`}>
                  {step.command}
                </span>
                {step.error && (
                  <span className="text-red-400 text-[11px] ml-2">{step.error}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
