import { useEffect, useState, useRef } from 'react';
import { useStreamStore } from '../../../../stores/streamStore';
import { FullscreenScreenMirror } from '../../wrappers/FullscreenScreenMirror';

export interface RecordActiveStepProps {
  onStop: () => void;
}

export function RecordActiveStep({ onStop }: RecordActiveStepProps) {
  const interactions = useStreamStore((s) => s.interactions);
  const [error, setError] = useState<string | null>(null);
  const { connectSSE, disconnectSSE } = useStreamStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Connect SSE on mount to receive interactions
  useEffect(() => {
    connectSSE();
    return () => disconnectSSE();
  }, [connectSSE, disconnectSSE]);

  // Auto-scroll interactions list
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interactions.length]);

  const handleStop = async () => {
    try {
      onStop();
    } catch (err) {
      setError('Failed to stop recording. Please try again.');
    }
  };

  const handleStartAgain = () => {
    window.location.reload();
  };

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-red-400 mb-4">{error}</div>
          <button
            onClick={handleStartAgain}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-all"
          >
            Start again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      <div className="flex flex-1 overflow-hidden gap-4 p-4">
        {/* Left: Device mirror */}
        <div className="flex flex-col flex-1 min-h-0">
          <FullscreenScreenMirror />
        </div>

        {/* Right: Interactions list */}
        <div className="flex flex-col w-80 shrink-0 bg-slate-900/40 rounded-lg border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
            <h3 className="text-xs font-semibold text-white">Interactions</h3>
            <span className="text-xs text-slate-400">{interactions.length} events</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {interactions.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-500">
                Waiting for interactions...
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {interactions.map((interaction, i) => (
                  <div key={i} className="px-4 py-2 text-xs hover:bg-slate-800/50 transition-colors">
                    <div className="text-slate-300 font-medium">
                      {i + 1}. {interaction.touchAction?.type || interaction.source || 'Event'}
                    </div>
                    {interaction.element?.text && (
                      <div className="text-slate-500 text-[10px] mt-0.5 truncate">
                        {interaction.element.text}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="px-4 py-4 border-t border-slate-800 flex items-center justify-center gap-4">
        <button
          onClick={handleStop}
          className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg transition-all active:scale-95"
        >
          Stop Recording
        </button>
      </div>
    </div>
  );
}
