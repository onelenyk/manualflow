import { useEffect, useState, useRef } from 'react';
import { useStreamStore } from '../../../../stores/streamStore';
import { useDeviceStore } from '../../../../stores/deviceStore';
import { api } from '../../../../api/client';
import { FullscreenScreenMirror } from '../../wrappers/FullscreenScreenMirror';

export interface RecordActiveStepProps {
  onStop: () => void;
}

function getYamlCommand(interaction: any, index: number): string {
  if (!interaction) return '';

  const type = interaction.touchAction?.type || interaction.source || 'unknown';

  switch (type?.toLowerCase()) {
    case 'tap':
      const x = interaction.touchAction?.x || 0;
      const y = interaction.touchAction?.y || 0;
      return `tap: { x: ${Math.round(x)}, y: ${Math.round(y)} }`;
    case 'scroll':
      const direction = interaction.touchAction?.direction || 'down';
      return `scroll: ${direction}`;
    case 'long_press':
      return `longPress: { duration: 1000 }`;
    case 'window_changed':
      return `waitForAnimationToEnd`;
    default:
      return `# ${type}`;
  }
}

function getActionIcon(type: string): string {
  const lower = type?.toLowerCase() || '';
  if (lower.includes('tap')) return '👆';
  if (lower.includes('scroll')) return '🔄';
  if (lower.includes('long_press')) return '⏱️';
  if (lower.includes('window')) return '🪟';
  if (lower.includes('access')) return '📋';
  return '⚡';
}

function getActionColor(type: string): string {
  const lower = type?.toLowerCase() || '';
  if (lower.includes('tap')) return 'from-blue-500/20 to-blue-600/10 border-blue-500/40';
  if (lower.includes('scroll')) return 'from-purple-500/20 to-purple-600/10 border-purple-500/40';
  if (lower.includes('long_press')) return 'from-orange-500/20 to-orange-600/10 border-orange-500/40';
  if (lower.includes('window')) return 'from-green-500/20 to-green-600/10 border-green-500/40';
  return 'from-slate-500/20 to-slate-600/10 border-slate-500/40';
}

export function RecordActiveStep({ onStop }: RecordActiveStepProps) {
  const interactions = useStreamStore((s) => s.interactions);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const [error, setError] = useState<string | null>(null);
  const [editingYaml, setEditingYaml] = useState<Record<number, string>>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { connectSSE, disconnectSSE } = useStreamStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Start recording and connect SSE on mount
  useEffect(() => {
    const startRecordingSession = async () => {
      try {
        await api.startRecording({ deviceSerial: selectedDevice || undefined });
        connectSSE();
      } catch (err) {
        setError('Failed to start recording. Please try again.');
        console.error('Start recording error:', err);
      }
    };

    startRecordingSession();
    return () => disconnectSSE();
  }, [connectSSE, disconnectSSE, selectedDevice]);

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

  const handleYamlChange = (index: number, value: string) => {
    setEditingYaml(prev => ({ ...prev, [index]: value }));
  };

  const getDisplayYaml = (index: number) => {
    return editingYaml[index] ?? getYamlCommand(interactions[index], index);
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
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-3 p-3 justify-center">
        {/* Left: Device mirror - maintains 9:16 phone aspect ratio */}
        <div className="flex flex-col w-full lg:w-96 lg:shrink-0 min-h-0 aspect-auto lg:aspect-[9/16] bg-black rounded-lg border border-slate-700 overflow-hidden">
          <FullscreenScreenMirror />
        </div>

        {/* Right: Interactions + YAML - capped width for readability */}
        <div className="flex flex-col flex-1 lg:max-w-2xl bg-slate-900/40 rounded-lg border border-slate-800 overflow-hidden min-h-0">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/60">
            <h3 className="text-xs font-bold text-white">Actions & Commands ({interactions.length})</h3>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-950/30">
            {interactions.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-400">
                Waiting for interactions...
              </div>
            ) : (
              <div className="space-y-2 p-3">
                {interactions.map((interaction, i) => {
                  const actionType = interaction.touchAction?.type || interaction.source || 'Event';
                  const icon = getActionIcon(actionType);
                  const colorClass = getActionColor(actionType);
                  return (
                    <div
                      key={i}
                      className={`bg-gradient-to-br ${colorClass} rounded-lg border backdrop-blur-sm hover:shadow-lg transition-all group`}
                    >
                      <div className="p-4">
                        {/* Header with number and type */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="text-2xl">{icon}</div>
                            <div>
                              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Step {i + 1}</div>
                              <div className="text-sm font-semibold text-white mt-0.5">{actionType}</div>
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono bg-slate-800/40 px-2 py-1 rounded">
                            #{i + 1}
                          </div>
                        </div>

                        {/* Details - 3 column layout */}
                        <div className="grid grid-cols-3 gap-2 mb-3 text-[10px]">
                          {interaction.element?.text && (
                            <div className="bg-slate-800/40 rounded px-2 py-1.5 border border-slate-700/50">
                              <div className="text-slate-400 font-semibold uppercase tracking-wide mb-0.5">Element</div>
                              <div className="text-slate-200 font-mono text-[9px] line-clamp-2">{interaction.element.text}</div>
                            </div>
                          )}
                          {(interaction.touchAction as any)?.x !== undefined && (
                            <div className="bg-slate-800/40 rounded px-2 py-1.5 border border-slate-700/50">
                              <div className="text-slate-400 font-semibold uppercase tracking-wide mb-0.5">X / Y</div>
                              <div className="text-slate-200 font-mono text-[9px]">
                                {Math.round((interaction.touchAction as any).x)} / {Math.round((interaction.touchAction as any).y)}
                              </div>
                            </div>
                          )}
                          {(interaction.touchAction as any)?.x !== undefined && (
                            <div className="bg-slate-800/40 rounded px-2 py-1.5 border border-slate-700/50">
                              <div className="text-slate-400 font-semibold uppercase tracking-wide mb-0.5">Type</div>
                              <div className="text-slate-300 font-semibold text-[9px]">{actionType}</div>
                            </div>
                          )}
                        </div>

                        {/* YAML command section */}
                        <div className="border-t border-slate-700/50 pt-3">
                          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-2">YAML Command</div>
                          {selectedIndex === i ? (
                            <input
                              type="text"
                              value={getDisplayYaml(i)}
                              onChange={(e) => handleYamlChange(i, e.target.value)}
                              onBlur={() => setSelectedIndex(null)}
                              className="w-full bg-blue-900/40 text-blue-100 text-sm p-2 rounded border border-blue-500/60 focus:border-blue-400 outline-none font-mono"
                              autoFocus
                            />
                          ) : (
                            <div
                              onClick={() => setSelectedIndex(i)}
                              className="w-full text-sm text-slate-100 font-mono p-2.5 rounded bg-slate-800/40 hover:bg-slate-700/60 cursor-pointer break-words border border-transparent hover:border-slate-600/50 transition-colors"
                            >
                              {getDisplayYaml(i)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
