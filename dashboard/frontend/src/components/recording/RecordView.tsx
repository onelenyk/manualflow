import { useState, useRef, useEffect } from 'react';
import { ScreenMirror } from '../device/ScreenMirror';
import { RecordingControls } from './RecordingControls';
import { useRecordingStore } from '../../stores/recordingStore';
import { useDeviceStore } from '../../stores/deviceStore';

type Tab = 'raw' | 'parsed';

export function RecordView() {
  const { state: recState, error } = useRecordingStore();
  const { selectedDevice } = useDeviceStore();
  const [tab, setTab] = useState<Tab>('parsed');
  const [rawLines, setRawLines] = useState<{ text: string; event?: any }[]>([]);
  const [parsedActions, setParsedActions] = useState<any[]>([]);
  const rawEsRef = useRef<EventSource | null>(null);
  const parsedEsRef = useRef<EventSource | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [rawLines.length, parsedActions.length]);

  // Connect SSE streams when recording starts
  useEffect(() => {
    if (recState !== 'recording') {
      rawEsRef.current?.close();
      parsedEsRef.current?.close();
      return;
    }

    // Clear previous data
    setRawLines([]);
    setParsedActions([]);

    // Raw events from agent
    if (selectedDevice) {
      const rawEs = new EventSource('/api/debug/events');
      rawEsRef.current = rawEs;
      rawEs.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === 'event' && data.event) {
            const e = data.event;
            setRawLines(prev => {
              const next = [...prev, { text: `[${e.type}] ${e.text || e.contentDescription || e.className || ''}`, event: e }];
              return next.length > 300 ? next.slice(-300) : next;
            });
          } else if (data.type === 'info') {
            setRawLines(prev => [...prev, { text: `[info] ${data.message}` }]);
          }
        } catch {}
      };
    }

    // Parsed actions from recording session
    const parsedEs = new EventSource('/api/recording/actions');
    parsedEsRef.current = parsedEs;
    parsedEs.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'action') {
          setParsedActions(prev => [...prev, data.action]);
        }
      } catch {}
    };

    return () => {
      rawEsRef.current?.close();
      parsedEsRef.current?.close();
    };
  }, [recState, selectedDevice]);

  return (
    <div className="flex h-full gap-4">
      {/* Left: Device panel */}
      <div className="flex flex-col min-h-0 w-[320px] shrink-0">
        <ScreenMirror />
      </div>

      {/* Right: Recording + Event Tabs */}
      <div className="flex flex-col flex-1 gap-3 min-h-0">
        {/* Recording controls */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Record Flow</h2>
            <RecordingControls />
          </div>
          {error && (
            <div className="mt-2 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 shrink-0">
          <TabButton label="Raw Events" count={rawLines.length} active={tab === 'raw'} onClick={() => setTab('raw')} />
          <TabButton label="Parsed Actions" count={parsedActions.length} active={tab === 'parsed'} onClick={() => setTab('parsed')} />
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 bg-slate-900/60 rounded-xl border border-slate-800 overflow-auto p-3">
          {recState !== 'recording' && rawLines.length === 0 && parsedActions.length === 0 ? (
            <div className="text-slate-600 text-xs text-center py-12">
              Click Record, then touch the physical phone screen
            </div>
          ) : (
            <>
              {tab === 'raw' && <RawTab lines={rawLines} />}
              {tab === 'parsed' && <ParsedTab actions={parsedActions} />}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

function TabButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
        active ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
      }`}
    >
      {label} {count > 0 && <span className="text-[10px] opacity-70">({count})</span>}
    </button>
  );
}

function RawTab({ lines }: { lines: { text: string; event?: any }[] }) {
  if (lines.length === 0) return <div className="text-slate-600 text-xs text-center py-8">Waiting for events...</div>;

  return (
    <div className="flex flex-col gap-1 text-[10px] font-mono">
      {lines.map((l, i) => (
        <div key={i} className={`px-2 py-1 rounded hover:bg-slate-800/50 ${l.event ? 'text-green-400' : 'text-yellow-400'}`}>
          <span className="text-slate-600 mr-2">#{i + 1}</span>
          {l.text}
          {l.event?.resourceId && <span className="text-slate-500 ml-2">({l.event.resourceId})</span>}
          {l.event?.packageName && <span className="text-slate-600 ml-2">[{l.event.packageName}]</span>}
        </div>
      ))}
    </div>
  );
}

function ParsedTab({ actions }: { actions: any[] }) {
  if (actions.length === 0) return <div className="text-slate-600 text-xs text-center py-8">Touch the phone to see parsed actions...</div>;

  const typeColors: Record<string, string> = {
    tap: 'bg-blue-500',
    swipe: 'bg-teal-500',
    longPress: 'bg-orange-500',
    scroll: 'bg-indigo-500',
  };

  return (
    <div className="flex flex-col gap-2">
      {actions.map((a, i) => (
        <div key={i} className="bg-slate-800/40 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-slate-600">#{i + 1}</span>
            <span className={`text-[9px] font-bold text-white px-1.5 py-0.5 rounded ${typeColors[a.type] || 'bg-slate-500'}`}>
              {a.type.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] ml-7">
            {a.type === 'tap' && (
              <>
                <Field label="position" value={`(${a.x}, ${a.y})`} color="text-yellow-400" />
                <Field label="timestamp" value={`${a.timestampMs}ms`} color="text-slate-500" />
              </>
            )}
            {a.type === 'swipe' && (
              <>
                <Field label="from" value={`(${a.startX}, ${a.startY})`} color="text-yellow-400" />
                <Field label="to" value={`(${a.endX}, ${a.endY})`} color="text-yellow-400" />
                <Field label="duration" value={`${Math.round(a.durationMs)}ms`} color="text-slate-400" />
              </>
            )}
            {a.type === 'longPress' && (
              <>
                <Field label="position" value={`(${a.x}, ${a.y})`} color="text-yellow-400" />
                <Field label="duration" value={`${Math.round(a.durationMs)}ms`} color="text-orange-400" />
              </>
            )}
            {a.type === 'scroll' && (
              <>
                <Field label="from" value={`(${a.startX}, ${a.startY})`} color="text-yellow-400" />
                <Field label="to" value={`(${a.endX}, ${a.endY})`} color="text-yellow-400" />
                <Field label="direction" value={a.direction} color="text-indigo-300" />
              </>
            )}
          </div>
        </div>
      ))}
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
