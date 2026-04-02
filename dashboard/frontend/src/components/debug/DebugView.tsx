import { useState, useRef, useEffect } from 'react';
import { useDeviceStore } from '../../stores/deviceStore';
import { api } from '../../api/client';

export function DebugView() {
  const { selectedDevice } = useDeviceStore();
  const [tab, setTab] = useState<'getevent' | 'adb' | 'hierarchy' | 'logcat'>('getevent');
  const [geteventLines, setGeteventLines] = useState<string[]>([]);
  const [geteventRunning, setGeteventRunning] = useState(false);
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

    const es = new EventSource(`/api/debug/getevent`);
    esRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'event') {
        setGeteventLines(prev => {
          const next = [...prev, data.line];
          return next.length > 500 ? next.slice(-500) : next;
        });
      } else if (data.type === 'info' || data.type === 'error') {
        setGeteventLines(prev => [...prev, `[${data.type}] ${data.message}`]);
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

  const tabs = [
    { id: 'getevent' as const, label: 'Touch Events' },
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
            <div className="flex-1 overflow-auto p-3 font-mono text-[10px] text-green-400 leading-relaxed">
              {geteventLines.length === 0 ? (
                <div className="text-slate-600 text-center py-8">
                  {geteventRunning ? 'Waiting for touch events... tap the device screen' : 'Click Start Capture, then touch the device'}
                </div>
              ) : (
                geteventLines.map((line, i) => (
                  <div key={i} className={`hover:bg-slate-800/50 px-1 ${line.startsWith('[') ? 'text-yellow-400' : ''}`}>
                    {line}
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
