import { useState, useRef, useEffect } from 'react';
import { ScreenMirror } from '../device/ScreenMirror';
import { RecordingControls } from './RecordingControls';
import { useRecordingStore } from '../../stores/recordingStore';
import { useDeviceStore } from '../../stores/deviceStore';

type Tab = 'raw' | 'parsed' | 'element' | 'command' | 'yaml';

export function RecordView() {
  const { state: recState, error, yaml } = useRecordingStore();
  const { selectedDevice } = useDeviceStore();
  const [tab, setTab] = useState<Tab>('parsed');

  const [rawLines, setRawLines] = useState<any[]>([]);
  const [parsedActions, setParsedActions] = useState<any[]>([]);
  const [elements, setElements] = useState<any[]>([]);
  const [commands, setCommands] = useState<any[]>([]);
  const [yamlLines, setYamlLines] = useState<string[]>([]);

  const esRefs = useRef<EventSource[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [rawLines.length, parsedActions.length, elements.length, commands.length, yamlLines.length]);

  // Connect all SSE streams when recording starts
  useEffect(() => {
    if (recState !== 'recording') {
      esRefs.current.forEach(es => es.close());
      esRefs.current = [];
      return;
    }

    setRawLines([]);
    setParsedActions([]);
    setElements([]);
    setCommands([]);
    setYamlLines([]);

    const connect = (path: string, handler: (data: any) => void): EventSource => {
      const es = new EventSource(`/api${path}`);
      es.onmessage = (ev) => { try { handler(JSON.parse(ev.data)); } catch {} };
      esRefs.current.push(es);
      return es;
    };

    // Raw getevent lines
    connect('/recording/raw', (data) => {
      if (data.type === 'raw' && data.line) {
        const l = data.line;
        setRawLines(prev => {
          const next = [...prev, `[${l.type}] ${l.code} ${l.value}`];
          return next.length > 500 ? next.slice(-500) : next;
        });
      }
    });

    // Parsed actions
    connect('/recording/actions', (data) => {
      if (data.type === 'action') setParsedActions(prev => [...prev, data.action]);
    });

    // Element lookups
    connect('/recording/elements', (data) => {
      if (data.type === 'element') setElements(prev => [...prev, data]);
    });

    // Commands + YAML
    connect('/recording/events', (data) => {
      if (data.type === 'command' && data.command) {
        setCommands(prev => [...prev, data.command]);
        setYamlLines(prev => [...prev, renderYamlLine(data.command)]);
      }
    });

    return () => {
      esRefs.current.forEach(es => es.close());
      esRefs.current = [];
    };
  }, [recState]);

  const fullYaml = yaml || (yamlLines.length > 0
    ? `appId: com.unknown.app\n---\n${yamlLines.join('\n')}\n`
    : '');

  const handleCopy = async () => {
    if (!fullYaml) return;
    await navigator.clipboard.writeText(fullYaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'raw', label: 'Raw', count: rawLines.length },
    { id: 'parsed', label: 'Parsed', count: parsedActions.length },
    { id: 'element', label: 'Element', count: elements.length },
    { id: 'command', label: 'Command', count: commands.length },
    { id: 'yaml', label: 'YAML', count: yamlLines.length },
  ];

  return (
    <div className="flex h-full gap-4">
      {/* Left: Device panel */}
      <div className="flex flex-col min-h-0 w-[320px] shrink-0">
        <ScreenMirror />
      </div>

      {/* Right */}
      <div className="flex flex-col flex-1 gap-3 min-h-0">
        {/* Controls */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Record Flow</h2>
            <RecordingControls />
          </div>
          {error && <div className="mt-2 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>}
        </div>

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
              {t.label} {t.count > 0 && <span className="opacity-60">({t.count})</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 bg-slate-900/60 rounded-xl border border-slate-800 overflow-auto p-3">
          {recState !== 'recording' && commands.length === 0 && !yaml ? (
            <div className="text-slate-600 text-xs text-center py-12">Click Record, then touch the phone screen</div>
          ) : (
            <>
              {tab === 'raw' && <RawTab lines={rawLines} />}
              {tab === 'parsed' && <ParsedTab actions={parsedActions} />}
              {tab === 'element' && <ElementTab elements={elements} />}
              {tab === 'command' && <CommandTab commands={commands} />}
              {tab === 'yaml' && <YamlTab yaml={fullYaml} onCopy={handleCopy} copied={copied} />}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

// --- Tab Components ---

function RawTab({ lines }: { lines: string[] }) {
  if (lines.length === 0) return <Empty text="Waiting for raw events..." />;
  return (
    <div className="font-mono text-[9px] text-green-400 leading-relaxed">
      {lines.map((l, i) => <div key={i} className="hover:bg-slate-800/50 px-1">{l}</div>)}
    </div>
  );
}

function ParsedTab({ actions }: { actions: any[] }) {
  if (actions.length === 0) return <Empty text="Touch the phone to see parsed actions..." />;
  const colors: Record<string, string> = { tap: 'bg-blue-500', swipe: 'bg-teal-500', longPress: 'bg-orange-500', scroll: 'bg-indigo-500' };

  return (
    <div className="flex flex-col gap-1.5">
      {actions.map((a, i) => (
        <div key={i} className="flex items-center gap-2 text-[10px] px-2 py-1.5 rounded-lg bg-slate-800/30">
          <span className="text-slate-600 w-4 text-right">#{i+1}</span>
          <span className={`text-[9px] font-bold text-white px-1.5 py-0.5 rounded ${colors[a.type] || 'bg-slate-500'}`}>{a.type.toUpperCase()}</span>
          {a.type === 'tap' && <span className="text-yellow-400 font-mono">({a.x}, {a.y})</span>}
          {a.type === 'swipe' && <span className="text-yellow-400 font-mono">({a.startX},{a.startY}) → ({a.endX},{a.endY})</span>}
          {a.type === 'scroll' && <span className="text-indigo-300 font-mono">{a.direction}</span>}
          {a.type === 'longPress' && <span className="text-yellow-400 font-mono">({a.x}, {a.y}) {Math.round(a.durationMs)}ms</span>}
        </div>
      ))}
    </div>
  );
}

function ElementTab({ elements }: { elements: any[] }) {
  if (elements.length === 0) return <Empty text="Elements will appear after taps are resolved..." />;

  return (
    <div className="flex flex-col gap-2">
      {elements.map((e, i) => (
        <div key={i} className="bg-slate-800/40 rounded-lg p-2.5 text-[10px]">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-slate-600">#{i+1}</span>
            <span className="text-[9px] font-bold text-white bg-purple-500 px-1.5 py-0.5 rounded">ELEMENT</span>
            <span className="text-white truncate">{e.element?.text || e.element?.contentDescription || e.element?.className || '(empty)'}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 ml-7">
            {e.element?.resourceId && <F label="resourceId" value={e.element.resourceId} color="text-green-400" />}
            {e.element?.text && <F label="text" value={e.element.text} color="text-white" />}
            {e.element?.contentDescription && <F label="contentDesc" value={e.element.contentDescription} color="text-cyan-400" />}
            {e.element?.className && <F label="class" value={e.element.className} color="text-slate-400" />}
            {e.element?.bounds && <F label="bounds" value={`(${e.element.bounds.left},${e.element.bounds.top})-(${e.element.bounds.right},${e.element.bounds.bottom})`} color="text-slate-500" />}
            {e.action && <F label="at" value={`(${e.action.x || e.action.startX}, ${e.action.y || e.action.startY})`} color="text-yellow-400" />}
            <F label="clickable" value={String(e.element?.clickable ?? '')} color={e.element?.clickable ? 'text-green-400' : 'text-slate-600'} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CommandTab({ commands }: { commands: any[] }) {
  if (commands.length === 0) return <Empty text="Commands will appear as gestures are resolved..." />;

  const colors: Record<string, string> = {
    launchApp: 'bg-purple-500', tapOn: 'bg-blue-500', longPressOn: 'bg-orange-500',
    scroll: 'bg-indigo-500', swipe: 'bg-teal-500', inputText: 'bg-amber-500',
  };

  return (
    <div className="flex flex-col gap-1.5">
      {commands.map((c, i) => (
        <div key={i} className="flex items-center gap-2 text-[10px] px-2 py-1.5 rounded-lg bg-slate-800/30">
          <span className="text-slate-600 w-4 text-right">#{i+1}</span>
          <span className={`text-[9px] font-bold text-white px-1.5 py-0.5 rounded ${colors[c.type] || 'bg-slate-500'}`}>{c.type}</span>
          {c.selector && (
            <span className="font-mono text-slate-300">
              {c.selector.kind === 'id' && <span className="text-green-400">id: "{c.selector.id}"</span>}
              {c.selector.kind === 'text' && <span className="text-white">"{c.selector.text}"</span>}
              {c.selector.kind === 'contentDescription' && <span className="text-cyan-400">[{c.selector.description}]</span>}
              {c.selector.kind === 'point' && <span className="text-yellow-400">point: ({c.selector.x},{c.selector.y})</span>}
            </span>
          )}
          {c.type === 'swipe' && <span className="text-teal-300 font-mono">{c.start} → {c.end}</span>}
          {c.type === 'inputText' && <span className="text-amber-300 font-mono">"{c.text}"</span>}
        </div>
      ))}
    </div>
  );
}

function YamlTab({ yaml, onCopy, copied }: { yaml: string; onCopy: () => void; copied: boolean }) {
  if (!yaml) return <Empty text="YAML will appear as commands are generated..." />;

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

function renderYamlLine(cmd: any): string {
  if (cmd.type === 'launchApp') return '- launchApp';
  if (cmd.type === 'scroll') return '- scroll';
  if (cmd.type === 'inputText') return `- inputText: "${cmd.text}"`;
  if (cmd.type === 'swipe') return `- swipe:\n    start: "${cmd.start}"\n    end: "${cmd.end}"`;
  if (cmd.selector) {
    const sel = cmd.selector;
    if (sel.kind === 'text') return `- ${cmd.type}: "${sel.text}"`;
    if (sel.kind === 'id') return `- ${cmd.type}:\n    id: "${sel.id}"`;
    if (sel.kind === 'contentDescription') return `- ${cmd.type}: "${sel.description}"`;
    if (sel.kind === 'point') return `- ${cmd.type}:\n    point: "${sel.x},${sel.y}"`;
  }
  return `- ${cmd.type}`;
}
