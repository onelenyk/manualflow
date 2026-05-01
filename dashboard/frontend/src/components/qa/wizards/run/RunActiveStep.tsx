import { useEffect, useState } from 'react';
import { useMaestroRunStore } from '../../../../stores/maestroRunStore';
import { adaptMaestroRunState } from '../../shared/RunStateAdapter';
import { MaestroRunViewer } from '../../../../components/maestro/MaestroRunViewer';
import { FullscreenScreenMirror } from '../../wrappers/FullscreenScreenMirror';

export interface RunActiveStepProps {
  flowPath: string;
  deviceSerial?: string;
  onComplete: () => void;
}

export function RunActiveStep({ flowPath, deviceSerial, onComplete }: RunActiveStepProps) {
  const activeRun = useMaestroRunStore((s) => s.active);
  const starting = useMaestroRunStore((s) => s.starting);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Start the run
    const startRun = async () => {
      try {
        // TODO: Call api.startMaestroRun(flowPath, deviceSerial)
        // For now, we'll simulate starting
      } catch (err) {
        setError('Failed to start test. Please try again.');
      }
    };

    startRun();
  }, [flowPath, deviceSerial]);

  // Check for run completion
  useEffect(() => {
    if (activeRun && (activeRun.status === 'passed' || activeRun.status === 'failed' || activeRun.status === 'stopped')) {
      // Give it a moment before transitioning
      const timer = setTimeout(() => {
        onComplete();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [activeRun, onComplete]);

  // Loading state
  if (starting) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <div className="text-sm text-slate-500">Starting test...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-red-400 mb-4">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-all"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Adapt MaestroRunState to RunState for MaestroRunViewer
  const adaptedRun = adaptMaestroRunState(activeRun);

  return (
    <div className="h-screen flex flex-col">
      {/* Fullscreen mirror */}
      <FullscreenScreenMirror />

      {/* Step progress overlay */}
      {activeRun && adaptedRun && (
        <div className="absolute top-4 left-4 right-4 bg-slate-900/90 backdrop-blur rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-white">Running: {activeRun.flowName}</div>
            <div className="text-xs text-slate-500">
              {adaptedRun.steps.filter((s) => s.status === 'passed' || s.status === 'failed').length} / {activeRun.steps.length} steps
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{
                width: `${(adaptedRun.steps.filter((s) => s.status === 'passed' || s.status === 'failed').length / Math.max(activeRun.steps.length, 1)) * 100}%`,
              }}
            />
          </div>

          {/* Step list (collapsible) */}
          <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
            {adaptedRun.steps.slice(-3).map((step, idx) => (
              <div key={idx} className="text-xs flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    step.status === 'passed'
                      ? 'bg-green-400'
                      : step.status === 'failed'
                      ? 'bg-red-400'
                      : step.status === 'running'
                      ? 'bg-blue-400 animate-pulse'
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

      {/* Run controls (minimal) */}
      {adaptedRun && (
        <div className="absolute bottom-8 right-8">
          <MaestroRunViewer
            run={adaptedRun}
            onPause={() => {/* TODO: Implement pause */}}
            onResume={() => {/* TODO: Implement resume */}}
            onStop={() => {/* TODO: Implement stop */}}
            onRestart={() => {/* TODO: Implement restart */}}
            onBack={() => {}}
            hideRawOutput={true}
          />
        </div>
      )}
    </div>
  );
}
