import { useState, useRef, useEffect } from 'react';
import { useLiveFlowStore, type FlowEntry, type MappingAlternative } from '../../stores/liveFlowStore';
import { useStreamStore } from '../../stores/streamStore';
import { useFlowStore } from '../../stores/flowStore';
import type { MaestroCommand } from '@maestro-recorder/shared';

const COMMAND_PALETTE: { group: string; commands: { label: string; command: MaestroCommand }[] }[] = [
  {
    group: 'Interaction',
    commands: [
      { label: 'tapOn', command: { type: 'tapOn', selector: { kind: 'text', text: '' } } },
      { label: 'longPressOn', command: { type: 'longPressOn', selector: { kind: 'text', text: '' } } },
      { label: 'doubleTapOn', command: { type: 'doubleTapOn', selector: { kind: 'text', text: '' } } },
      { label: 'swipe', command: { type: 'swipe', direction: 'up' } },
      { label: 'scroll', command: { type: 'scroll' } },
    ],
  },
  {
    group: 'Input',
    commands: [
      { label: 'inputText', command: { type: 'inputText', text: '' } },
      { label: 'eraseText', command: { type: 'eraseText' } },
      { label: 'pressKey', command: { type: 'pressKey', key: 'back' } },
      { label: 'hideKeyboard', command: { type: 'hideKeyboard' } },
    ],
  },
  {
    group: 'Navigation',
    commands: [
      { label: 'back', command: { type: 'back' } },
      { label: 'openLink', command: { type: 'openLink', url: '' } },
      { label: 'scrollUntilVisible', command: { type: 'scrollUntilVisible', selector: { kind: 'text', text: '' } } },
    ],
  },
  {
    group: 'Assert',
    commands: [
      { label: 'assertVisible', command: { type: 'assertVisible', selector: { kind: 'text', text: '' } } },
      { label: 'assertNotVisible', command: { type: 'assertNotVisible', selector: { kind: 'text', text: '' } } },
    ],
  },
  {
    group: 'Flow',
    commands: [
      { label: 'launchApp', command: { type: 'launchApp' } },
      { label: 'waitForAnimation', command: { type: 'waitForAnimationToEnd' } },
      { label: 'takeScreenshot', command: { type: 'takeScreenshot' } },
    ],
  },
];

export function FlowBuilder() {
  const { entries, appId, removeEntry, moveEntry, insertCommand, remapInteraction, setAppId, getYaml, clear } = useLiveFlowStore();
  const { interactions } = useStreamStore();
  const { fetchFlows } = useFlowStore();
  const [copied, setCopied] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  const handleSave = async () => {
    if (!saveName.trim()) return;
    const { saveAsFlow } = useLiveFlowStore.getState();
    await saveAsFlow(saveName.trim());
    setSaveName('');
    setShowSave(false);
    fetchFlows();
  };

  const handleCopy = async () => {
    const yaml = getYaml();
    await navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const findInteraction = (id?: number) => {
    if (!id) return undefined;
    return interactions.find(i => i.id === id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Flow Builder</h3>
          <span className="text-[11px] text-slate-500">{entries.length} commands</span>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={appId}
            onChange={e => setAppId(e.target.value)}
            placeholder="com.your.app"
            className="w-36 px-2 py-0.5 text-[11px] bg-slate-800 border border-slate-700 text-slate-300 rounded focus:outline-none focus:border-blue-500"
          />
          <button onClick={handleCopy} className="px-2 py-0.5 text-[11px] bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors">
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={() => setShowSave(!showSave)} className="px-2 py-0.5 text-[11px] bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">
            Save
          </button>
          <button onClick={clear} className="px-2 py-0.5 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-400 rounded transition-colors">
            Clear
          </button>
        </div>
      </div>

      {/* Save dialog */}
      {showSave && (
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <input
            type="text"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Flow name..."
            autoFocus
            className="flex-1 px-2 py-1 text-xs bg-slate-800 border border-blue-500 text-white rounded focus:outline-none"
          />
          <button onClick={handleSave} disabled={!saveName.trim()} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded transition-colors">
            Save
          </button>
          <button onClick={() => setShowSave(false)} className="text-xs text-slate-500 hover:text-white">Cancel</button>
        </div>
      )}

      {/* Flow entries */}
      <div className="flex-1 overflow-auto min-h-0">
        {entries.length === 0 ? (
          <div className="text-slate-600 text-[12px] text-center py-8">
            Commands will appear as you interact with the device
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <div className="text-[11px] text-slate-600 font-mono px-2 py-1">- launchApp</div>
            {entries.map((entry) => (
              <FlowEntryRow
                key={entry.id}
                entry={entry}
                interaction={findInteraction(entry.interactionId)}
                onRemove={() => removeEntry(entry.id)}
                onMoveUp={() => moveEntry(entry.id, 'up')}
                onMoveDown={() => moveEntry(entry.id, 'down')}
                onRemap={(commands) => entry.interactionId && remapInteraction(entry.interactionId, commands)}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Command Palette toggle + palette */}
      <div className="shrink-0 mt-2 border-t border-slate-800 pt-2">
        <button
          onClick={() => setShowPalette(!showPalette)}
          className="text-[11px] text-slate-400 hover:text-white transition-colors mb-1"
        >
          {showPalette ? '\u25BC Hide commands' : '\u25B6 Insert command...'}
        </button>

        {showPalette && (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {COMMAND_PALETTE.map(group => (
              <div key={group.group}>
                <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">{group.group}</div>
                <div className="flex flex-wrap gap-1">
                  {group.commands.map(c => (
                    <button
                      key={c.label}
                      onClick={() => insertCommand(structuredClone(c.command))}
                      className="px-1.5 py-0.5 text-[11px] bg-slate-800 hover:bg-blue-600 text-slate-400 hover:text-white rounded transition-colors"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Flow Entry Row ---

const CMD_COLORS: Record<string, string> = {
  tapOn: 'text-blue-400', longPressOn: 'text-orange-400', doubleTapOn: 'text-blue-300',
  inputText: 'text-amber-400', eraseText: 'text-amber-300', swipe: 'text-teal-400',
  scroll: 'text-indigo-400', assertVisible: 'text-pink-400', assertNotVisible: 'text-pink-300',
  back: 'text-slate-300', hideKeyboard: 'text-slate-300', pressKey: 'text-slate-300',
  scrollUntilVisible: 'text-indigo-300', waitForAnimationToEnd: 'text-slate-400',
  launchApp: 'text-purple-400', takeScreenshot: 'text-green-400', openLink: 'text-cyan-400',
};

function FlowEntryRow({
  entry,
  interaction,
  onRemove,
  onMoveUp,
  onMoveDown,
  onRemap,
}: {
  entry: FlowEntry;
  interaction?: any;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemap: (commands: MaestroCommand[]) => void;
}) {
  const [showAlts, setShowAlts] = useState(false);
  const getAlternatives = useLiveFlowStore(s => s.getAlternatives);

  const cmd = entry.command;
  const color = CMD_COLORS[cmd.type] || 'text-slate-400';
  const yamlLine = formatCommandShort(cmd);
  const isManual = entry.source === 'manual';

  const alts: MappingAlternative[] = interaction ? getAlternatives(interaction) : [];

  return (
    <div className={`group flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800/50 text-[12px] font-mono ${isManual ? 'border-l-2 border-blue-500/40' : ''}`}>
      {/* Move buttons */}
      <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onMoveUp} className="text-[9px] text-slate-600 hover:text-white leading-none">{'\u25B2'}</button>
        <button onClick={onMoveDown} className="text-[9px] text-slate-600 hover:text-white leading-none">{'\u25BC'}</button>
      </div>

      {/* Command content */}
      <span className={`flex-1 truncate ${color}`}>{yamlLine}</span>

      {/* Mapping dropdown */}
      {alts.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowAlts(!showAlts)}
            className="text-xs text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-700/60 hover:bg-slate-600 transition-colors"
          >
            {'\u25BE'}
          </button>
          {showAlts && (
            <div className="absolute right-0 top-7 z-10 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[180px]">
              {alts.map((alt, i) => (
                <button
                  key={i}
                  onClick={() => { onRemap(alt.commands); setShowAlts(false); }}
                  className="block w-full text-left px-3 py-1.5 text-[12px] text-slate-300 hover:bg-blue-600 hover:text-white transition-colors"
                >
                  {alt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete */}
      <button
        onClick={onRemove}
        className="text-[11px] text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
      >
        {'\u00D7'}
      </button>
    </div>
  );
}

function formatCommandShort(cmd: MaestroCommand): string {
  const sel = (cmd as any).selector;
  const selectorStr = sel
    ? sel.kind === 'text' ? `"${sel.text}"` : sel.kind === 'id' ? `id: "${sel.id}"` : sel.kind === 'contentDescription' ? `"${sel.description}"` : `(${sel.x},${sel.y})`
    : '';

  switch (cmd.type) {
    case 'tapOn': return `- tapOn: ${selectorStr}`;
    case 'doubleTapOn': return `- doubleTapOn: ${selectorStr}`;
    case 'longPressOn': return `- longPressOn: ${selectorStr}`;
    case 'inputText': return `- inputText: "${(cmd as any).text}"`;
    case 'eraseText': return `- eraseText${(cmd as any).chars ? `: ${(cmd as any).chars}` : ''}`;
    case 'swipe': return 'direction' in cmd ? `- swipe: ${(cmd as any).direction}` : '- swipe';
    case 'scroll': return '- scroll';
    case 'assertVisible': return `- assertVisible: ${selectorStr}`;
    case 'assertNotVisible': return `- assertNotVisible: ${selectorStr}`;
    case 'scrollUntilVisible': return `- scrollUntilVisible: ${selectorStr}`;
    default: return `- ${cmd.type}`;
  }
}
