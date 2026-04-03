import { useState, useRef, useEffect } from 'react';
import { useDeviceStore } from '../../stores/deviceStore';
import { api } from '../../api/client';

export function DebugView() {
  const { selectedDevice } = useDeviceStore();
  const [tab, setTab] = useState<'getevent' | 'tree' | 'adb' | 'hierarchy' | 'logcat'>('tree');
  const [geteventLines, setGeteventLines] = useState<{ raw: string; event?: any }[]>([]);
  const [geteventRunning, setGeteventRunning] = useState(false);
  const [treeData, setTreeData] = useState<any[]>([]);
  const [adbCommand, setAdbCommand] = useState('');
  const [adbOutput, setAdbOutput] = useState('');
  const [hierarchyXml, setHierarchyXml] = useState('');
  const [logcatOutput, setLogcatOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [geteventLines.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { esRef.current?.close(); };
  }, []);

  const startGetevent = () => {
    if (!selectedDevice) return;
    setGeteventLines([]);
    setGeteventRunning(true);

    const es = new EventSource(`/api/debug/events`);
    esRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'event' && data.event) {
        const e = data.event;
        const line = `[${e.type}] ${e.text || e.contentDescription || e.className || ''}`;
        setGeteventLines(prev => {
          const next = [...prev, { raw: line.trim(), event: e }];
          return next.length > 500 ? next.slice(-500) : next;
        });
      } else if (data.type === 'info' || data.type === 'error') {
        setGeteventLines(prev => [...prev, { raw: `[${data.type}] ${data.message}` }]);
      }
    };

    es.onerror = () => {
      setGeteventRunning(false);
      es.close();
    };
  };

  const stopGetevent = () => {
    esRef.current?.close();
    esRef.current = null;
    setGeteventRunning(false);
  };

  const runAdbCommand = async () => {
    if (!adbCommand.trim()) return;
    setLoading(true);
    try {
      const result = await fetch('/api/debug/adb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: adbCommand }),
      }).then(r => r.json());
      setAdbOutput(result.output || 'No output');
    } catch (e: any) {
      setAdbOutput(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  const fetchHierarchy = async () => {
    setLoading(true);
    try {
      const result = await fetch('/api/debug/hierarchy').then(r => r.json());
      setHierarchyXml(result.xml || result.error || 'No data');
    } catch (e: any) {
      setHierarchyXml(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  const fetchLogcat = async () => {
    setLoading(true);
    try {
      const result = await fetch('/api/debug/logcat').then(r => r.json());
      setLogcatOutput(result.output || result.error || 'No logs');
    } catch (e: any) {
      setLogcatOutput(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  if (!selectedDevice) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-600 text-xs">Select a device to view raw data</div>
      </div>
    );
  }

  const fetchTree = async () => {
    setLoading(true);
    try {
      const result = await fetch('/api/debug/tree').then(r => r.json());
      if (Array.isArray(result)) setTreeData(result);
      else setTreeData([]);
    } catch {
      setTreeData([]);
    }
    setLoading(false);
  };

  const tabs = [
    { id: 'tree' as const, label: 'Screen Tree' },
    { id: 'getevent' as const, label: 'Device Events' },
    { id: 'adb' as const, label: 'ADB Shell' },
    { id: 'hierarchy' as const, label: 'UI Hierarchy' },
    { id: 'logcat' as const, label: 'Agent Logs' },
  ];

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Tabs */}
      <div className="flex gap-1 shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              tab === t.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 bg-slate-900/60 rounded-xl border border-slate-800 flex flex-col">
        {tab === 'tree' && (
          <>
            <div className="flex items-center gap-2 p-3 border-b border-slate-800 shrink-0">
              <button onClick={fetchTree} disabled={loading} className="px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg">
                {loading ? 'Loading...' : 'Dump Screen Tree'}
              </button>
              <span className="text-[10px] text-slate-600">{treeData.length} elements</span>
            </div>
            <div className="flex-1 overflow-auto p-3">
              {treeData.length === 0 ? (
                <div className="text-slate-600 text-xs text-center py-8">Click "Dump Screen Tree" to capture current screen elements</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {treeData.map((node: any, i: number) => {
                    const hasId = !!node.resourceId;
                    const hasText = !!node.text;
                    const hasDesc = !!node.contentDescription;
                    const isInteractive = node.clickable || node.editable || node.scrollable;
                    const isEmpty = !hasId && !hasText && !hasDesc;

                    return (
                      <div
                        key={i}
                        className={`rounded-lg p-2 text-[10px] ${
                          isInteractive ? 'bg-slate-800/60 border border-slate-700/50' : 'bg-slate-800/20'
                        } ${isEmpty ? 'opacity-40' : ''}`}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-slate-600 w-5 text-right shrink-0">#{i}</span>
                          <span className="text-slate-500 font-mono truncate">{node.className?.split('.').pop() || '?'}</span>
                          {hasText && <span className="text-white truncate">"{node.text}"</span>}
                          {!hasText && hasDesc && <span className="text-cyan-400 truncate">[{node.contentDescription}]</span>}
                          {isInteractive && (
                            <div className="flex gap-1 ml-auto shrink-0">
                              {node.clickable && <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1 rounded">click</span>}
                              {node.editable && <span className="text-[8px] bg-amber-500/20 text-amber-400 px-1 rounded">edit</span>}
                              {node.scrollable && <span className="text-[8px] bg-indigo-500/20 text-indigo-400 px-1 rounded">scroll</span>}
                            </div>
                          )}
                        </div>
                        {(hasId || node.bounds) && (
                          <div className="flex gap-3 ml-7 text-[9px]">
                            {hasId && <span><span className="text-slate-600">id:</span> <span className="text-green-400 font-mono">{node.resourceId}</span></span>}
                            {node.bounds && (
                              <span className="text-slate-600">
                                ({node.bounds.left},{node.bounds.top})-({node.bounds.right},{node.bounds.bottom})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'getevent' && (
          <>
            <div className="flex items-center gap-2 p-3 border-b border-slate-800 shrink-0">
              {!geteventRunning ? (
                <button onClick={startGetevent} className="px-3 py-1 text-xs font-medium bg-green-600 hover:bg-green-500 text-white rounded-lg">
                  Start Capture
                </button>
              ) : (
                <button onClick={stopGetevent} className="px-3 py-1 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg">
                  Stop
                </button>
              )}
              <button onClick={() => setGeteventLines([])} className="px-3 py-1 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-white rounded-lg">
                Clear
              </button>
              {geteventRunning && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
              <span className="text-[10px] text-slate-600 ml-auto">{geteventLines.length} events</span>
            </div>
            <div className="flex-1 overflow-auto p-3 text-[10px] leading-relaxed">
              {geteventLines.length === 0 ? (
                <div className="text-slate-600 text-center py-8">
                  {geteventRunning ? 'Waiting for events... interact with the device' : 'Click Start Capture, then touch the device'}
                </div>
              ) : (
                geteventLines.map((entry, i) => (
                  <div key={i} className="mb-2 border-b border-slate-800/50 pb-2">
                    {entry.event ? (
                      <EventCard event={entry.event} index={i} />
                    ) : (
                      <div className="text-yellow-400 font-mono px-1">{entry.raw}</div>
                    )}
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>
          </>
        )}

        {tab === 'adb' && (
          <>
            <div className="flex gap-2 p-3 border-b border-slate-800 shrink-0">
              <span className="text-xs text-slate-500 py-1">adb shell</span>
              <input
                value={adbCommand}
                onChange={e => setAdbCommand(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runAdbCommand()}
                placeholder="dumpsys activity activities"
                className="flex-1 bg-slate-950 text-green-400 text-xs font-mono px-2 py-1 rounded border border-slate-800 outline-none focus:border-blue-500/50"
              />
              <button onClick={runAdbCommand} disabled={loading} className="px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg">
                {loading ? '...' : 'Run'}
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-3 font-mono text-[10px] text-slate-300 leading-relaxed whitespace-pre-wrap">
              {adbOutput || 'Run a command to see output'}
            </pre>
          </>
        )}

        {tab === 'hierarchy' && (
          <>
            <div className="flex items-center gap-2 p-3 border-b border-slate-800 shrink-0">
              <button onClick={fetchHierarchy} disabled={loading} className="px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg">
                {loading ? 'Dumping...' : 'Dump UI Hierarchy'}
              </button>
              <span className="text-[10px] text-slate-600">Uses uiautomator dump</span>
            </div>
            <pre className="flex-1 overflow-auto p-3 font-mono text-[10px] text-cyan-400 leading-relaxed whitespace-pre-wrap">
              {hierarchyXml || 'Click "Dump UI Hierarchy" to capture current screen'}
            </pre>
          </>
        )}

        {tab === 'logcat' && (
          <>
            <div className="flex items-center gap-2 p-3 border-b border-slate-800 shrink-0">
              <button onClick={fetchLogcat} disabled={loading} className="px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg">
                {loading ? 'Loading...' : 'Fetch Agent Logs'}
              </button>
              <span className="text-[10px] text-slate-600">Last 50 lines from MaestroHttpServer</span>
            </div>
            <pre className="flex-1 overflow-auto p-3 font-mono text-[10px] text-amber-400 leading-relaxed whitespace-pre-wrap">
              {logcatOutput || 'Click "Fetch Agent Logs" to see agent output'}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}

const typeColors: Record<string, string> = {
  click: 'bg-blue-500',
  longClick: 'bg-orange-500',
  scroll: 'bg-indigo-500',
  textChanged: 'bg-amber-500',
  windowChanged: 'bg-purple-500',
  selected: 'bg-teal-500',
  focused: 'bg-cyan-500',
};

function EventCard({ event: e, index }: { event: any; index: number }) {
  const color = typeColors[e.type] || 'bg-slate-500';

  return (
    <div className="rounded-lg bg-slate-800/40 p-2">
      {/* Header: type badge + main identifier */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[9px] text-slate-600 w-4 text-right">#{index + 1}</span>
        <span className={`text-[9px] font-bold text-white px-1.5 py-0.5 rounded ${color}`}>
          {e.type.toUpperCase()}
        </span>
        {e.text && <span className="text-[11px] text-white truncate">"{e.text}"</span>}
        {!e.text && e.contentDescription && (
          <span className="text-[11px] text-slate-300 truncate">[{e.contentDescription}]</span>
        )}
        {!e.text && !e.contentDescription && e.className && (
          <span className="text-[11px] text-slate-500 truncate">{e.className}</span>
        )}
      </div>

      {/* Properties grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] ml-7">
        {e.resourceId && <Field label="resourceId" value={e.resourceId} color="text-green-400" />}
        {e.className && <Field label="class" value={e.className} color="text-slate-400" />}
        {e.contentDescription && <Field label="contentDesc" value={e.contentDescription} color="text-cyan-400" />}
        {e.packageName && <Field label="package" value={e.packageName} color="text-slate-500" />}

        {e.bounds && (
          <Field label="bounds" value={`(${e.bounds.left},${e.bounds.top})-(${e.bounds.right},${e.bounds.bottom})`} color="text-slate-400" />
        )}
        {e.bounds && (
          <Field label="center" value={`(${Math.floor((e.bounds.left + e.bounds.right) / 2)}, ${Math.floor((e.bounds.top + e.bounds.bottom) / 2)})`} color="text-yellow-400" />
        )}

        {/* State flags */}
        {(e.clickable || e.scrollable || e.editable || e.checkable) && (
          <div className="col-span-2 flex gap-2 mt-0.5">
            {e.clickable && <Flag label="clickable" />}
            {e.scrollable && <Flag label="scrollable" />}
            {e.editable && <Flag label="editable" />}
            {e.checkable && <Flag label="checkable" />}
            {e.checked && <Flag label="checked" active />}
            {e.focused && <Flag label="focused" active />}
          </div>
        )}

        {/* Scroll-specific */}
        {e.type === 'scroll' && (
          <>
            {e.direction && <Field label="direction" value={e.direction} color="text-indigo-300" />}
            <Field label="scroll" value={`x:${e.scrollX} y:${e.scrollY} / max x:${e.maxScrollX} y:${e.maxScrollY}`} color="text-slate-400" />
            {e.itemCount > 0 && <Field label="items" value={`${e.fromIndex}-${e.toIndex} of ${e.itemCount}`} color="text-slate-400" />}
          </>
        )}

        {/* Text-specific */}
        {e.type === 'textChanged' && (
          <>
            {e.beforeText !== undefined && <Field label="before" value={`"${e.beforeText}"`} color="text-red-400" />}
            <Field label="after" value={`"${e.text}"`} color="text-green-400" />
            {e.addedCount > 0 && <Field label="added" value={String(e.addedCount)} color="text-green-400" />}
            {e.removedCount > 0 && <Field label="removed" value={String(e.removedCount)} color="text-red-400" />}
          </>
        )}

        {/* Parent fallback */}
        {e.parentResourceId && <Field label="parentId" value={e.parentResourceId} color="text-slate-500" />}
        {e.parentText && <Field label="parentText" value={e.parentText} color="text-slate-500" />}

        {/* Compose extras */}
        {e.extras && (
          <div className="col-span-2">
            <span className="text-slate-600">extras: </span>
            <span className="text-purple-400">{JSON.stringify(e.extras)}</span>
          </div>
        )}

        <Field label="timestamp" value={String(e.timestamp)} color="text-slate-600" />
      </div>
    </div>
  );
}

function Field({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="truncate">
      <span className="text-slate-600">{label}: </span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  );
}

function Flag({ label, active }: { label: string; active?: boolean }) {
  return (
    <span className={`text-[9px] px-1 py-0.5 rounded ${active ? 'bg-green-400/20 text-green-400' : 'bg-slate-700 text-slate-500'}`}>
      {label}
    </span>
  );
}
