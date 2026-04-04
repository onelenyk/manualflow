import { useState, useRef, useEffect } from 'react';
import { ScreenMirror } from '../device/ScreenMirror';
import { useStreamStore } from '../../stores/streamStore';
import { useDeviceStore } from '../../stores/deviceStore';

type Tab = 'interactions' | 'yaml';

export function RecordView() {
  const {
    connected, interactions, selectedIds, yaml, exporting, error,
    connectSSE, disconnectSSE, toggleSelect, selectAll, selectNone,
    exportYaml, clearInteractions,
  } = useStreamStore();
  const { selectedDevice } = useDeviceStore();
  const [tab, setTab] = useState<Tab>('interactions');
  const [appId, setAppId] = useState('com.unknown.app');
  const [copied, setCopied] = useState(false);
  const [lastClickedId, setLastClickedId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Connect SSE on mount
  useEffect(() => {
    connectSSE();
    return () => disconnectSSE();
  }, []);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interactions.length]);

  const visible = interactions.filter(i => !i.filteredAsKeyboardTap);
  const selectedCount = selectedIds.size;

  const handleCopy = async () => {
    if (!yaml) return;
    await navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    exportYaml(appId);
    setTab('yaml');
  };

  const handleRowClick = (id: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedId !== null) {
      // Range select
      const from = Math.min(lastClickedId, id);
      const to = Math.max(lastClickedId, id);
      useStreamStore.getState().selectRange(from, to);
    } else {
      toggleSelect(id);
    }
    setLastClickedId(id);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'interactions', label: `Interactions (${visible.length})` },
    { id: 'yaml', label: 'YAML' },
  ];

  return (
    <div className="flex h-full gap-4">
      {/* Left: Device panel */}
      <div className="flex flex-col min-h-0 w-[320px] shrink-0">
        <ScreenMirror />
      </div>

      {/* Right */}
      <div className="flex flex-col flex-1 gap-3 min-h-0">
        {/* Header bar */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-white">Device Stream</h2>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className="text-[10px] text-slate-400">
                  {connected ? 'Connected' : selectedDevice ? 'Waiting for agent...' : 'No device'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* App ID input */}
              <input
                type="text"
                value={appId}
                onChange={e => setAppId(e.target.value)}
                placeholder="com.your.app"
                className="w-40 px-2 py-1 text-[10px] bg-slate-800 border border-slate-700 text-slate-300 rounded-md focus:outline-none focus:border-blue-500"
              />

              {/* Export button */}
              <button
                onClick={handleExport}
                disabled={selectedCount === 0 || exporting}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-medium rounded-lg transition-all active:scale-95"
              >
                {exporting ? 'Exporting...' : `Export (${selectedCount})`}
              </button>
            </div>
          </div>
          {error && <div className="mt-2 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>}
        </div>

        {/* Selection toolbar */}
        {visible.length > 0 && (
          <div className="flex items-center gap-2 shrink-0 text-[10px]">
            <button onClick={selectAll} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-md transition-colors">
              Select all
            </button>
            <button onClick={selectNone} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-md transition-colors">
              Clear selection
            </button>
            <button onClick={clearInteractions} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-md transition-colors">
              Clear all
            </button>
            <span className="text-slate-600 ml-auto">
              {selectedCount > 0 ? `${selectedCount} selected` : 'Click to select, Shift+click for range'}
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-2.5 py-1.5 text-[10px] font-medium rounded-lg transition-all ${
                tab === t.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 bg-slate-900/60 rounded-xl border border-slate-800 overflow-auto p-3">
          {!connected && visible.length === 0 ? (
            <div className="text-slate-600 text-xs text-center py-12">
              {selectedDevice ? 'Start the agent to begin streaming...' : 'Select a device to begin'}
            </div>
          ) : (
            <>
              {tab === 'interactions' && (
                <InteractionList
                  interactions={visible}
                  selectedIds={selectedIds}
                  onRowClick={handleRowClick}
                />
              )}
              {tab === 'yaml' && <YamlTab yaml={yaml} onCopy={handleCopy} copied={copied} />}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

// --- Interaction List ---

function InteractionList({
  interactions,
  selectedIds,
  onRowClick,
}: {
  interactions: any[];
  selectedIds: Set<number>;
  onRowClick: (id: number, e: React.MouseEvent) => void;
}) {
  if (interactions.length === 0) {
    return <Empty text="Interactions will appear as you use the device..." />;
  }

  const actionColors: Record<string, string> = {
    tap: 'bg-blue-500', swipe: 'bg-teal-500', longPress: 'bg-orange-500', scroll: 'bg-indigo-500',
  };

  return (
    <div className="flex flex-col gap-1">
      {interactions.map((interaction) => {
        const selected = selectedIds.has(interaction.id);
        const a = interaction.touchAction;
        const el = interaction.element;
        const a11y = interaction.accessibilityEvents;
        const isPending = interaction.status === 'pending';
        const isA11yOnly = interaction.source === 'accessibility';

        return (
          <div
            key={interaction.id}
            onClick={(e) => onRowClick(interaction.id, e)}
            className={`rounded-lg p-2.5 cursor-pointer transition-all select-none ${
              selected
                ? 'bg-blue-500/15 border border-blue-500/40'
                : 'bg-slate-800/30 border border-transparent hover:bg-slate-800/50'
            } ${isPending ? 'opacity-60' : ''}`}
          >
            {/* Row header */}
            <div className="flex items-center gap-2 text-[10px]">
              {/* Checkbox */}
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                selected ? 'bg-blue-500 border-blue-500' : 'border-slate-600'
              }`}>
                {selected && <span className="text-white text-[8px]">{'✓'}</span>}
              </div>

              <span className="text-slate-600 w-5 text-right">#{interaction.id}</span>

              {/* Action badge */}
              {a && (
                <span className={`text-[9px] font-bold text-white px-1.5 py-0.5 rounded ${actionColors[a.type] || 'bg-slate-500'}`}>
                  {a.type.toUpperCase()}
                </span>
              )}

              {/* Accessibility-only badge */}
              {isA11yOnly && a11y.length > 0 && (
                <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded bg-purple-500">
                  {a11y[0].type.toUpperCase()}
                </span>
              )}

              {/* Coordinates / details */}
              {a?.type === 'tap' && <span className="text-yellow-400 font-mono text-[9px]">({a.x}, {a.y})</span>}
              {a?.type === 'swipe' && <span className="text-yellow-400 font-mono text-[9px]">({a.startX},{a.startY}){'\u2192'}({a.endX},{a.endY})</span>}
              {a?.type === 'scroll' && <span className="text-indigo-300 font-mono text-[9px]">{a.direction}</span>}
              {a?.type === 'longPress' && <span className="text-yellow-400 font-mono text-[9px]">({a.x}, {a.y}) {Math.round(a.durationMs)}ms</span>}

              {/* Element summary (inline) */}
              {el && (
                <span className="text-slate-400 text-[9px] truncate">
                  {el.text ? `"${el.text}"` : el.resourceId ? `#${el.resourceId.split(':id/').pop()}` : el.contentDescription || el.className}
                </span>
              )}

              {/* A11y event text for standalone events */}
              {isA11yOnly && a11y[0]?.text && (
                <span className="text-slate-300 font-mono text-[9px] truncate">"{a11y[0].text}"</span>
              )}

              {isPending && <span className="text-yellow-500 text-[8px] animate-pulse ml-auto">PENDING</span>}
            </div>

            {/* Expanded details when selected */}
            {selected && (
              <div className="ml-7 mt-1.5 space-y-1">
                {/* Debug info */}
                {a?.debug && (
                  <div className="text-[9px]">
                    <div className="text-slate-500 italic">{a.debug.reason}</div>
                    <div className="flex gap-3 text-slate-600">
                      <span>dist: <span className="text-slate-400">{a.debug.endDistance}px</span></span>
                      <span>dur: <span className="text-slate-400">{a.debug.durationMs}ms</span></span>
                      <span>vel: <span className="text-slate-400">{a.debug.velocity}</span></span>
                    </div>
                  </div>
                )}

                {/* Element detail */}
                {el && (
                  <div className="bg-slate-800/50 rounded px-2 py-1.5 text-[9px]">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                      {el.resourceId && <F label="id" value={el.resourceId} color="text-green-400" />}
                      {el.text && <F label="text" value={el.text} color="text-white" />}
                      {el.contentDescription && <F label="desc" value={el.contentDescription} color="text-cyan-400" />}
                      {el.className && <F label="class" value={el.className} color="text-slate-400" />}
                      {el.bounds && <F label="bounds" value={`(${el.bounds.left},${el.bounds.top})-(${el.bounds.right},${el.bounds.bottom})`} color="text-slate-500" />}
                    </div>
                  </div>
                )}

                {/* A11y events */}
                {a11y.length > 0 && (
                  <div className="space-y-0.5">
                    {a11y.map((evt: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[9px] text-slate-500">
                        <span className="text-[8px] font-bold text-orange-400 bg-orange-400/10 px-1 rounded">{evt.type}</span>
                        {evt.text && <span className="text-slate-300 font-mono truncate">"{evt.text}"</span>}
                        {evt.packageName && <span className="text-slate-600">{evt.packageName}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function YamlTab({ yaml, onCopy, copied }: { yaml: string; onCopy: () => void; copied: boolean }) {
  if (!yaml) return <Empty text="Select interactions and click Export to generate YAML" />;

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button onClick={onCopy} className="px-2.5 py-1 text-[10px] font-medium bg-slate-700 hover:bg-slate-600 text-white rounded-md">
          {copied ? 'Copied!' : 'Copy YAML'}
        </button>
      </div>
      <pre className="bg-slate-950 rounded-lg p-3 text-[11px] text-green-400 font-mono leading-relaxed whitespace-pre-wrap select-all">
        {yaml}
      </pre>
    </div>
  );
}

// --- Helpers ---

function Empty({ text }: { text: string }) {
  return <div className="text-slate-600 text-xs text-center py-12">{text}</div>;
}

function F({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="truncate">
      <span className="text-slate-600">{label}: </span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  );
}
