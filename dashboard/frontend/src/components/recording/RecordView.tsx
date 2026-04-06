import { useState, useRef, useEffect } from 'react';
import { ScreenMirror } from '../device/ScreenMirror';
import { useStreamStore } from '../../stores/streamStore';
import { useLiveFlowStore } from '../../stores/liveFlowStore';
import { useDeviceStore } from '../../stores/deviceStore';
import { FlowBuilder } from './FlowBuilder';

export function RecordView() {
  const {
    connected, interactions, ignoredIds,
    connectSSE, disconnectSSE,
    toggleIgnore, ignoreAllOfType, ignoreAllWithContent, clearIgnored,
    clearInteractions,
  } = useStreamStore();
  const { addFromInteraction } = useLiveFlowStore();
  const { selectedDevice } = useDeviceStore();

  const [searchText, setSearchText] = useState('');
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [showIgnored, setShowIgnored] = useState(false);
  const [ignoreInput, setIgnoreInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Track which interactions have been auto-added to flow
  const addedToFlow = useRef<Set<number>>(new Set());

  // Connect SSE on mount
  useEffect(() => {
    connectSSE();
    return () => disconnectSSE();
  }, []);

  // Auto-add completed interactions to flow
  useEffect(() => {
    for (const i of interactions) {
      if (i.status === 'complete' && !addedToFlow.current.has(i.id) && !ignoredIds.has(i.id)) {
        addedToFlow.current.add(i.id);
        addFromInteraction(i);
      }
    }
  }, [interactions, ignoredIds]);

  // Auto-scroll interactions
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interactions.length]);

  const ignoredCount = ignoredIds.size;

  const visible = interactions.filter(i => {
    if (ignoredIds.has(i.id) && !showIgnored) return false;

    const actionType = i.touchAction?.type;
    const eventType = i.source === 'accessibility' && i.accessibilityEvents[0]?.type;
    const type = actionType || eventType || 'unknown';
    if (hiddenTypes.has(type)) return false;

    if (searchText) {
      const q = searchText.toLowerCase();
      const el = i.element;
      const a11y = i.accessibilityEvents;
      const matchesElement = el && (
        el.text?.toLowerCase().includes(q) ||
        el.resourceId?.toLowerCase().includes(q) ||
        el.contentDescription?.toLowerCase().includes(q) ||
        el.className?.toLowerCase().includes(q)
      );
      const matchesA11y = a11y.some((e: any) =>
        e.text?.toLowerCase().includes(q) ||
        e.resourceId?.toLowerCase().includes(q) ||
        e.packageName?.toLowerCase().includes(q)
      );
      const matchesAction = actionType?.toLowerCase().includes(q);
      if (!matchesElement && !matchesA11y && !matchesAction) return false;
    }

    return true;
  });

  const typeCounts: Record<string, number> = {};
  for (const i of interactions) {
    if (i.filteredAsKeyboardTap && !showIgnored) continue;
    const type = i.touchAction?.type || (i.source === 'accessibility' && i.accessibilityEvents[0]?.type) || 'unknown';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  }

  const toggleType = (type: string) => {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="flex h-full gap-4">
      {/* Left: Device mirror */}
      <div className="flex flex-col min-h-0 w-[320px] shrink-0">
        <ScreenMirror />
      </div>

      {/* Center: Interactions */}
      <div className="flex flex-col flex-1 gap-2 min-h-0">
        {/* Header */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-[11px] font-semibold text-white">Interactions</h2>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className="text-[11px] text-slate-400">
                  {connected ? 'Connected' : selectedDevice ? 'Waiting...' : 'No device'}
                </span>
              </div>
              <span className="text-[11px] text-slate-500">{visible.length} events</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <button onClick={clearInteractions} className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition-colors">
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        {interactions.length > 0 && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Filter..."
              className="w-28 px-2 py-0.5 text-[11px] bg-slate-800 border border-slate-700 text-slate-300 rounded focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
            />
            <div className="flex gap-1">
              {Object.entries(typeCounts).map(([type, count]) => (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`px-1.5 py-0.5 text-xs font-medium rounded transition-all ${
                    hiddenTypes.has(type)
                      ? 'bg-slate-800/50 text-slate-600 line-through'
                      : `${typeChipColor(type)} text-white`
                  }`}
                >
                  {type} <span className="opacity-60">{count}</span>
                </button>
              ))}
            </div>
            {/* Ignore controls */}
            <input
              type="text"
              value={ignoreInput}
              onChange={e => setIgnoreInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && ignoreInput) { ignoreAllWithContent(ignoreInput); setIgnoreInput(''); } }}
              placeholder="Ignore..."
              className="w-24 px-2 py-0.5 text-[11px] bg-slate-800 border border-slate-700 text-slate-300 rounded focus:outline-none focus:border-red-500 placeholder:text-slate-600"
            />
            {ignoredCount > 0 && (
              <button
                onClick={() => setShowIgnored(!showIgnored)}
                className={`px-1.5 py-0.5 text-xs rounded transition-colors ${showIgnored ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-500'}`}
              >
                {ignoredCount} ignored
              </button>
            )}
            {(hiddenTypes.size > 0 || searchText || ignoredCount > 0) && (
              <button onClick={() => { setHiddenTypes(new Set()); setSearchText(''); clearIgnored(); }} className="text-xs text-slate-500 hover:text-white">
                Reset
              </button>
            )}
          </div>
        )}

        {/* Interaction list */}
        <div className="flex-1 min-h-0 bg-slate-900/60 rounded-xl border border-slate-800 overflow-auto p-2">
          {!connected && visible.length === 0 ? (
            <div className="text-slate-600 text-xs text-center py-8">
              {selectedDevice ? 'Start the agent to begin...' : 'Select a device'}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {visible.map((interaction) => (
                <InteractionRow
                  key={interaction.id}
                  interaction={interaction}
                  ignored={ignoredIds.has(interaction.id)}
                  onIgnore={() => toggleIgnore(interaction.id)}
                  onIgnoreType={() => {
                    const t = interaction.touchAction?.type || (interaction.source === 'accessibility' && interaction.accessibilityEvents[0]?.type) || '';
                    if (t) ignoreAllOfType(t);
                  }}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      {/* Right: Flow Builder */}
      <div className="flex flex-col w-[400px] shrink-0 min-h-0 bg-slate-900/60 rounded-xl border border-slate-800 p-3">
        <FlowBuilder />
      </div>
    </div>
  );
}

// --- Interaction Row (compact) ---

const actionColors: Record<string, string> = {
  tap: 'bg-blue-500', swipe: 'bg-teal-500', longPress: 'bg-orange-500', scroll: 'bg-indigo-500',
};

function InteractionRow({ interaction, ignored, onIgnore, onIgnoreType }: {
  interaction: any;
  ignored: boolean;
  onIgnore: () => void;
  onIgnoreType: () => void;
}) {
  const a = interaction.touchAction;
  const el = interaction.element;
  const a11y = interaction.accessibilityEvents;
  const isA11yOnly = interaction.source === 'accessibility';

  const elSummary = el?.text
    ? `"${el.text.slice(0, 20)}"`
    : el?.resourceId
      ? `#${(el.resourceId || '').split(':id/').pop()}`
      : el?.contentDescription?.slice(0, 20)
        || '';

  return (
    <div
      onContextMenu={(e) => { e.preventDefault(); onIgnore(); }}
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] transition-all ${
        ignored ? 'opacity-30 bg-red-500/5' : 'hover:bg-slate-800/50'
      }`}
    >
      <span className="text-slate-600 w-4 text-right shrink-0">#{interaction.id}</span>

      {interaction.filteredAsKeyboardTap && (
        <span className="font-bold text-white px-1 py-0.5 rounded bg-slate-600 text-xs">KBD</span>
      )}

      {a && (
        <span className={`font-bold text-white px-1 py-0.5 rounded text-xs ${actionColors[a.type] || 'bg-slate-500'}`}>
          {a.type.toUpperCase()}
        </span>
      )}

      {isA11yOnly && a11y[0] && (
        <span className="font-bold text-white px-1 py-0.5 rounded text-xs bg-purple-500">
          {a11y[0].type.toUpperCase()}
        </span>
      )}

      {a?.type === 'tap' && <span className="text-yellow-400 font-mono">({a.x},{a.y})</span>}
      {a?.type === 'scroll' && <span className="text-indigo-300 font-mono">{a.direction}</span>}

      {elSummary && <span className="text-slate-400 truncate">{elSummary}</span>}

      {isA11yOnly && a11y[0]?.text && !elSummary && (
        <span className="text-slate-400 truncate">"{a11y[0].text.slice(0, 20)}"</span>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onIgnore(); }}
        className="ml-auto text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 shrink-0"
        style={{ opacity: undefined }} // always show for now
      >
        {ignored ? 'undo' : '\u00D7'}
      </button>
    </div>
  );
}

// --- Helpers ---

function typeChipColor(type: string): string {
  const m: Record<string, string> = {
    tap: 'bg-blue-500/80', swipe: 'bg-teal-500/80', scroll: 'bg-indigo-500/80',
    longPress: 'bg-orange-500/80', click: 'bg-purple-500/80', textChanged: 'bg-amber-500/80',
    windowChanged: 'bg-pink-500/80',
  };
  return m[type] || 'bg-slate-600';
}
