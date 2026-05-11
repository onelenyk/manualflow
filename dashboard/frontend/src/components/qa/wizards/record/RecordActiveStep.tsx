import { useEffect, useState, useRef, useMemo } from 'react';
import { useStreamStore } from '../../../../stores/streamStore';
import { useDeviceStore } from '../../../../stores/deviceStore';
import { useLiveFlowStore } from '../../../../stores/liveFlowStore';
import { api } from '../../../../api/client';
import { FullscreenScreenMirror } from '../../wrappers/FullscreenScreenMirror';
import { WizardStepNav } from '../../shared/WizardStepNav';
import { InteractionHeader } from '../../../recording/shared/InteractionHeader';
import { InteractionSummary } from '../../../recording/shared/InteractionSummary';
import { YamlCommandEditor } from '../../../recording/shared/YamlCommandEditor';

export interface RecordActiveStepProps {
  onStop: () => void;
  /** Called when the user wants to abandon the recording and return to step 1.
      The wizard parent is responsible for actually stopping the server-side
      recording — this component just reports the intent. */
  onBackToPrepare?: () => void;
}

export function RecordActiveStep({ onStop, onBackToPrepare }: RecordActiveStepProps) {
  const interactions = useStreamStore((s) => s.interactions);
  const removeInteractionFromStream = useStreamStore((s) => s.removeInteraction);
  const clearInteractions = useStreamStore((s) => s.clearInteractions);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const addFromInteraction = useLiveFlowStore((s) => s.addFromInteraction);
  const remapInteraction = useLiveFlowStore((s) => s.remapInteraction);
  const clearLiveFlow = useLiveFlowStore((s) => s.clear);
  const entries = useLiveFlowStore((s) => s.entries);
  const { connectSSE, disconnectSSE } = useStreamStore();

  const [error, setError] = useState<string | null>(null);
  const [showFiltered, setShowFiltered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Start recording + connect SSE on mount
  useEffect(() => {
    const start = async () => {
      try {
        await api.startRecording({ deviceSerial: selectedDevice || undefined });
        connectSSE();
      } catch (err) {
        setError('Failed to start recording. Please try again.');
        // eslint-disable-next-line no-console
        console.error('Start recording error:', err);
      }
    };
    start();
    return () => disconnectSSE();
  }, [connectSSE, disconnectSSE, selectedDevice]);

  // Auto-feed completed interactions into liveFlowStore.
  // addFromInteraction is idempotent via processedInteractionIds.
  useEffect(() => {
    for (const i of interactions) {
      if (i.status === 'complete') addFromInteraction(i as any);
    }
  }, [interactions, addFromInteraction]);

  // Auto-scroll to bottom on new interaction — pause while user is editing.
  // `block: 'end'` keeps the bottom in view without ever scrolling a parent
  // container; otherwise the wizard header/footer can be scrolled out of view
  // when content first appears and layout shifts.
  useEffect(() => {
    if (isEditing) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [interactions.length, isEditing]);

  const handleStop = async () => {
    try {
      onStop();
    } catch {
      setError('Failed to stop recording. Please try again.');
    }
  };

  const handleStartAgain = () => window.location.reload();

  const handleResetAll = () => {
    void clearInteractions();
    clearLiveFlow();
    setExpandedIds(new Set());
  };

  const handleRemoveInteraction = (id: number) => {
    // Drop the flow entries belonging to this interaction first so the YAML
    // output reflects the deletion immediately, then evict the interaction
    // itself from the stream.
    remapInteraction(id, []);
    removeInteractionFromStream(id);
    setExpandedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // Group entries by interactionId for fast lookup
  const entriesByInteractionId = useMemo(() => {
    const m = new Map<number, typeof entries>();
    for (const e of entries) {
      if (e.interactionId == null) continue;
      const arr = m.get(e.interactionId) ?? [];
      arr.push(e);
      m.set(e.interactionId, arr);
    }
    return m;
  }, [entries]);

  const visibleInteractions = interactions.filter((i) => !i.filteredAsKeyboardTap);
  const filteredInteractions = interactions.filter((i) => i.filteredAsKeyboardTap);

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

  const renderRow = (interaction: any, sequenceIndex: number, opts: { greyed?: boolean } = {}) => {
    const list = entriesByInteractionId.get(interaction.id) ?? [];
    const expanded = expandedIds.has(interaction.id);
    return (
      <div
        key={interaction.id}
        className={`rounded-lg border border-slate-800 bg-slate-900/40 p-3 ${
          opts.greyed ? 'opacity-40 pointer-events-none' : ''
        }`}
      >
        <div className="flex flex-col md:flex-row gap-3 items-stretch">
          {/* Left: compact interaction header, expandable to full detail */}
          <div className="flex-1 min-w-0 bg-slate-950/30 rounded">
            <InteractionHeader
              interaction={interaction}
              sequenceIndex={sequenceIndex}
              expanded={expanded}
              onToggleExpand={() => toggleExpanded(interaction.id)}
              onRemove={opts.greyed ? undefined : () => handleRemoveInteraction(interaction.id)}
            />
            {expanded && (
              <div className="px-2 pb-2 border-t border-slate-800">
                <InteractionSummary interaction={interaction} />
              </div>
            )}
          </div>
          {/* Arrow indicating "interaction → yaml" derivation */}
          <div className="hidden md:flex items-center text-slate-600 text-lg shrink-0" aria-hidden>
            →
          </div>
          {/* Right: editable YAML for this interaction */}
          <div className="flex-1 min-w-0 flex">
            <div className="flex-1">
              <YamlCommandEditor
                entries={list}
                onRemap={(cmds) => remapInteraction(interaction.id, cmds)}
                readOnly={opts.greyed || list.length === 0}
                onFocusChange={setIsEditing}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      <div className="px-4 py-2 border-b border-slate-800 shrink-0">
        <WizardStepNav
          step={2}
          totalSteps={3}
          title="Recording"
          onBack={onBackToPrepare}
          backLabel="Cancel"
          onForward={handleStop}
          forwardEnabled
          forwardLabel="Review & save"
        />
      </div>
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-3 p-3 justify-center">
        {/* Left: Device mirror */}
        <div className="flex flex-col w-full lg:w-96 lg:shrink-0 min-h-0 aspect-auto lg:aspect-[9/16] bg-black rounded-lg border border-slate-700 overflow-hidden">
          <FullscreenScreenMirror />
        </div>

        {/* Right: Interactions + paired YAML — full width so each row can split horizontally */}
        <div className="flex flex-col flex-1 bg-slate-900/40 rounded-lg border border-slate-800 overflow-hidden min-h-0">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-slate-900/60">
            <h3 className="text-xs font-bold text-white">Interactions → Commands ({visibleInteractions.length})</h3>
            <div className="flex items-center gap-3">
              {filteredInteractions.length > 0 && (
                <button
                  onClick={() => setShowFiltered((v) => !v)}
                  className="text-[11px] text-slate-400 hover:text-white"
                >
                  {showFiltered ? `Hide ${filteredInteractions.length} filtered` : `Show ${filteredInteractions.length} filtered`}
                </button>
              )}
              <button
                type="button"
                onClick={handleResetAll}
                disabled={interactions.length === 0 && entries.length === 0}
                className="text-[11px] text-slate-400 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Remove every recorded interaction and clear the flow"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Sticky column headers — only shown on md+ when there are rows */}
          {(visibleInteractions.length > 0 || filteredInteractions.length > 0) && (
            <div className="hidden md:flex items-center gap-3 px-6 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-950/60 border-b border-slate-800 shrink-0">
              <div className="flex-1">Interaction</div>
              <div className="shrink-0 w-4" aria-hidden />
              <div className="flex-1">YAML command</div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto bg-slate-950/30">
            {visibleInteractions.length === 0 && filteredInteractions.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-400">
                Waiting for interactions...
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {visibleInteractions.map((i, idx) => renderRow(i, idx + 1))}
                {showFiltered && filteredInteractions.map((i, idx) => renderRow(i, visibleInteractions.length + idx + 1, { greyed: true }))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>
      </div>

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
