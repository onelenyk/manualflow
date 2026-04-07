import { useState, useRef, useEffect } from 'react';
import { ScreenMirror } from '../device/ScreenMirror';
import { useStreamStore } from '../../stores/streamStore';
import { useLiveFlowStore } from '../../stores/liveFlowStore';
import { useDeviceStore } from '../../stores/deviceStore';
import { FlowBuilder } from './FlowBuilder';

export function RecordView() {
  const {
    connected, interactions, selectedIds, ignoredIds,
    connectSSE, disconnectSSE, toggleSelect, selectAll, selectNone,
    toggleIgnore, ignoreAllOfType, ignoreAllWithContent, clearIgnored,
    removeSelected, removeInteraction, clearInteractions,
  } = useStreamStore();
  const { addFromInteraction } = useLiveFlowStore();
  const { selectedDevice } = useDeviceStore();

  const [searchText, setSearchText] = useState('');
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [showIgnored, setShowIgnored] = useState(false);
  const [ignoreInput, setIgnoreInput] = useState('');
  const [lastClickedId, setLastClickedId] = useState<number | null>(null);

  const selectedCount = selectedIds.size;

  const handleRowClick = (id: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedId !== null) {
      useStreamStore.getState().selectRange(Math.min(lastClickedId, id), Math.max(lastClickedId, id));
    } else {
      toggleSelect(id);
    }
    setLastClickedId(id);
  };
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
              {selectedCount > 0 && (
                <>
                  <span className="text-slate-500">{selectedCount} sel</span>
                  <button onClick={removeSelected} className="px-2 py-0.5 bg-red-600/80 hover:bg-red-500 text-white rounded transition-colors">
                    Remove
                  </button>
                  <button onClick={selectNone} className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition-colors">
                    Deselect
                  </button>
                </>
              )}
              <button onClick={selectAll} className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition-colors">
                All
              </button>
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
                  selected={selectedIds.has(interaction.id)}
                  ignored={ignoredIds.has(interaction.id)}
                  onClick={(e) => handleRowClick(interaction.id, e)}
                  onRemove={() => removeInteraction(interaction.id)}
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

function InteractionRow({ interaction, selected, ignored, onClick, onRemove, onIgnore, onIgnoreType }: {
  interaction: any;
  selected: boolean;
  ignored: boolean;
  onClick: (e: React.MouseEvent) => void;
  onRemove: () => void;
  onIgnore: () => void;
  onIgnoreType: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const a = interaction.touchAction;
  const el = interaction.element;
  const a11y = interaction.accessibilityEvents;
  const isA11yOnly = interaction.source === 'accessibility';
  const kbd = interaction.keyboardState;

  const elSummary = el?.text
    ? `"${el.text.slice(0, 25)}"`
    : el?.resourceId
      ? `#${(el.resourceId || '').split(':id/').pop()}`
      : el?.contentDescription?.slice(0, 25)
        || '';

  return (
    <div
      onContextMenu={(e) => { e.preventDefault(); onIgnore(); }}
      className={`rounded transition-all ${
        ignored ? 'opacity-30 bg-red-500/5' :
        selected ? 'bg-blue-500/10 border border-blue-500/30' :
        'hover:bg-slate-800/40 border border-transparent'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] cursor-pointer" onClick={onClick}>
        {/* Checkbox */}
        <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
          selected ? 'bg-blue-500 border-blue-500' : 'border-slate-600'
        }`}>
          {selected && <span className="text-white text-[8px]">{'\u2713'}</span>}
        </div>

        <span className="text-slate-600 w-5 text-right shrink-0">#{interaction.id}</span>

        {interaction.filteredAsKeyboardTap && (
          <span className="font-bold text-white px-1 py-0.5 rounded bg-slate-600 text-[10px]">KBD</span>
        )}

        {a && (
          <span className={`font-bold text-white px-1 py-0.5 rounded text-[10px] ${actionColors[a.type] || 'bg-slate-500'}`}>
            {a.type.toUpperCase()}
          </span>
        )}

        {isA11yOnly && a11y[0] && (
          <span className="font-bold text-white px-1 py-0.5 rounded text-[10px] bg-purple-500">
            {a11y[0].type.toUpperCase()}
          </span>
        )}

        {a?.type === 'tap' && <span className="text-yellow-400 font-mono text-[10px]">({a.x},{a.y})</span>}
        {a?.type === 'longPress' && <span className="text-yellow-400 font-mono text-[10px]">({a.x},{a.y}) {Math.round(a.durationMs)}ms</span>}
        {a?.type === 'scroll' && <span className="text-indigo-300 font-mono text-[10px]">{a.direction}</span>}
        {a?.type === 'swipe' && <span className="text-teal-300 font-mono text-[10px]">({a.startX},{a.startY}){'\u2192'}({a.endX},{a.endY})</span>}

        {elSummary && <span className="text-slate-400 text-[10px] truncate">{elSummary}</span>}

        {isA11yOnly && a11y[0]?.text && !elSummary && (
          <span className="text-slate-400 text-[10px] truncate">"{a11y[0].text.slice(0, 25)}"</span>
        )}

        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="text-slate-600 hover:text-white text-[10px]"
          >
            {expanded ? '\u25BC' : '\u25B6'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-slate-700 hover:text-red-400 text-[11px]"
          >
            {'\u00D7'}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-2 ml-6 space-y-1.5 text-[10px]">
          {/* Touch debug */}
          {a?.debug && (
            <div>
              <div className="text-slate-500 italic">{a.debug.reason}</div>
              <div className="flex gap-3 text-slate-600 font-mono">
                <span>dist: <span className="text-slate-400">{a.debug.endDistance}px</span></span>
                <span>maxDist: <span className="text-slate-400">{a.debug.maxDistFromStart}px</span></span>
                <span>dur: <span className="text-slate-400">{a.debug.durationMs}ms</span></span>
                <span>vel: <span className="text-slate-400">{a.debug.velocity}</span></span>
                <span>vert: <span className="text-slate-400">{a.debug.verticalRatio}</span></span>
              </div>
            </div>
          )}

          {/* Element details */}
          {el && (
            <div className="bg-slate-800/50 rounded px-2 py-1.5">
              <div className="text-purple-400 font-bold text-[9px] mb-1">ELEMENT</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {el.text && <F label="text" value={el.text} color="text-white" />}
                {el.resourceId && <F label="id" value={el.resourceId} color="text-green-400" />}
                {el.contentDescription && <F label="desc" value={el.contentDescription} color="text-cyan-400" />}
                {el.className && <F label="class" value={el.className} color="text-slate-400" />}
                {el.bounds && <F label="bounds" value={`(${el.bounds.left},${el.bounds.top})-(${el.bounds.right},${el.bounds.bottom})`} color="text-slate-500" />}
                <F label="clickable" value={String(el.clickable ?? false)} color={el.clickable ? 'text-green-400' : 'text-slate-600'} />
                <F label="editable" value={String(el.editable ?? false)} color={el.editable ? 'text-amber-400' : 'text-slate-600'} />
                <F label="focused" value={String(el.focused ?? false)} color={el.focused ? 'text-blue-400' : 'text-slate-600'} />
                <F label="scrollable" value={String(el.scrollable ?? false)} color={el.scrollable ? 'text-indigo-400' : 'text-slate-600'} />
              </div>
            </div>
          )}

          {/* Accessibility events */}
          {a11y.length > 0 && (
            <div>
              <div className="text-orange-400 font-bold text-[9px] mb-1">A11Y EVENTS ({a11y.length})</div>
              {a11y.map((evt: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-slate-500 py-0.5">
                  <span className="text-[9px] font-bold text-orange-400 bg-orange-400/10 px-1 rounded">{evt.type}</span>
                  {evt.text && <span className="text-slate-300 font-mono">"{evt.text}"</span>}
                  {evt.beforeText && <span className="text-slate-600 font-mono">was: "{evt.beforeText}"</span>}
                  {evt.packageName && <span className="text-slate-600">{evt.packageName}</span>}
                  {evt.direction && <span className="text-indigo-300">{evt.direction}</span>}
                  {evt.className && <span className="text-slate-700">{evt.className.split('.').pop()}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Keyboard state */}
          {kbd && (
            <div className="text-slate-600">
              kbd: {kbd.open ? `open (top: ${kbd.top})` : 'closed'}
            </div>
          )}

          {/* Meta */}
          <div className="flex gap-3 text-slate-700">
            <span>source: {interaction.source}</span>
            <span>status: {interaction.status}</span>
            <span>ts: {interaction.timestampMs}</span>
            <span>screen: {interaction.screenWidth}x{interaction.screenHeight}</span>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1 border-t border-slate-800/50">
            <button onClick={onIgnore} className="text-[10px] text-slate-500 hover:text-red-400">
              {ignored ? 'Unignore' : 'Ignore'}
            </button>
            <button onClick={onIgnoreType} className="text-[10px] text-slate-500 hover:text-red-400">
              Ignore all of this type
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Helpers ---

function F({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="truncate">
      <span className="text-slate-600">{label}: </span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  );
}

function typeChipColor(type: string): string {
  const m: Record<string, string> = {
    tap: 'bg-blue-500/80', swipe: 'bg-teal-500/80', scroll: 'bg-indigo-500/80',
    longPress: 'bg-orange-500/80', click: 'bg-purple-500/80', textChanged: 'bg-amber-500/80',
    windowChanged: 'bg-pink-500/80',
  };
  return m[type] || 'bg-slate-600';
}
