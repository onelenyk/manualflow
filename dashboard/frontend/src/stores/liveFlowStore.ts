import { create } from 'zustand';
import type { MaestroCommand } from '@maestro-recorder/shared';
import { mapInteractionToCommands, getMappingAlternatives } from '@maestro-recorder/shared';

interface Interaction {
  id: number;
  source: string;
  status: string;
  timestampMs: number;
  touchAction?: any;
  element?: any;
  accessibilityEvents: any[];
  keyboardState?: any;
  filteredAsKeyboardTap: boolean;
  screenWidth: number;
  screenHeight: number;
}

export interface FlowEntry {
  id: string;
  interactionId?: number;
  command: MaestroCommand;
  source: 'auto' | 'manual';
}

export interface MappingAlternative {
  label: string;
  commands: MaestroCommand[];
}

interface LiveFlowStore {
  entries: FlowEntry[];
  appId: string;
  nextId: number;

  addFromInteraction: (interaction: Interaction) => void;
  insertCommand: (command: MaestroCommand, afterEntryId?: string) => void;
  updateEntry: (id: string, command: MaestroCommand) => void;
  removeEntry: (id: string) => void;
  moveEntry: (id: string, direction: 'up' | 'down') => void;
  remapInteraction: (interactionId: number, commands: MaestroCommand[]) => void;
  getAlternatives: (interaction: Interaction) => MappingAlternative[];
  getYaml: () => string;
  setAppId: (appId: string) => void;
  saveAsFlow: (name: string) => Promise<any>;
  clear: () => void;
}

function makeId(nextId: number): string {
  return `e${nextId}`;
}

export const useLiveFlowStore = create<LiveFlowStore>((set, get) => ({
  entries: [],
  appId: 'com.unknown.app',
  nextId: 1,

  addFromInteraction: (interaction: Interaction) => {
    if (interaction.filteredAsKeyboardTap) return;
    if (interaction.status !== 'complete') return;

    const commands = mapInteractionToCommands(interaction as any);
    if (commands.length === 0) return;

    set(s => {
      let id = s.nextId;
      const newEntries = commands.map(cmd => ({
        id: makeId(id++),
        interactionId: interaction.id,
        command: cmd,
        source: 'auto' as const,
      }));
      return { entries: [...s.entries, ...newEntries], nextId: id };
    });
  },

  insertCommand: (command: MaestroCommand, afterEntryId?: string) => {
    set(s => {
      const entry: FlowEntry = {
        id: makeId(s.nextId),
        command,
        source: 'manual',
      };
      if (!afterEntryId) {
        return { entries: [...s.entries, entry], nextId: s.nextId + 1 };
      }
      const idx = s.entries.findIndex(e => e.id === afterEntryId);
      const next = [...s.entries];
      next.splice(idx === -1 ? next.length : idx + 1, 0, entry);
      return { entries: next, nextId: s.nextId + 1 };
    });
  },

  updateEntry: (id: string, command: MaestroCommand) => {
    set(s => ({
      entries: s.entries.map(e => e.id === id ? { ...e, command } : e),
    }));
  },

  removeEntry: (id: string) => {
    set(s => ({ entries: s.entries.filter(e => e.id !== id) }));
  },

  moveEntry: (id: string, direction: 'up' | 'down') => {
    set(s => {
      const idx = s.entries.findIndex(e => e.id === id);
      if (idx === -1) return s;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= s.entries.length) return s;
      const next = [...s.entries];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return { entries: next };
    });
  },

  remapInteraction: (interactionId: number, commands: MaestroCommand[]) => {
    set(s => {
      const firstIdx = s.entries.findIndex(e => e.interactionId === interactionId);
      const without = s.entries.filter(e => e.interactionId !== interactionId);
      const insertAt = firstIdx >= 0 ? firstIdx : without.length;

      let id = s.nextId;
      const newEntries = commands.map(cmd => ({
        id: makeId(id++),
        interactionId,
        command: cmd,
        source: 'auto' as const,
      }));

      const result = [...without];
      result.splice(Math.min(insertAt, result.length), 0, ...newEntries);
      return { entries: result, nextId: id };
    });
  },

  getAlternatives: (interaction: Interaction) => {
    return getMappingAlternatives(interaction as any);
  },

  getYaml: () => {
    const { entries, appId } = get();
    const lines: string[] = [];
    lines.push(`appId: ${appId}`);
    lines.push('---');
    lines.push('- launchApp');
    for (const entry of entries) {
      lines.push(renderCommandYaml(entry.command));
    }
    return lines.join('\n') + '\n';
  },

  setAppId: (appId: string) => set({ appId }),

  saveAsFlow: async (name: string) => {
    const yaml = get().getYaml();
    const res = await fetch('/api/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, yaml }),
    });
    return res.json();
  },

  clear: () => set({ entries: [], nextId: 1 }),
}));

// --- YAML rendering ---

function renderCommandYaml(cmd: MaestroCommand): string {
  switch (cmd.type) {
    case 'launchApp': return '- launchApp';
    case 'tapOn': return selectorYaml('tapOn', cmd);
    case 'doubleTapOn': return selectorYaml('doubleTapOn', cmd);
    case 'longPressOn': return selectorYaml('longPressOn', cmd);
    case 'inputText': return `- inputText: "${esc((cmd as any).text)}"`;
    case 'eraseText': return (cmd as any).chars ? `- eraseText: ${(cmd as any).chars}` : '- eraseText';
    case 'swipe':
      if ('direction' in cmd) return `- swipe:\n    direction: ${(cmd as any).direction}`;
      return `- swipe:\n    start: "${(cmd as any).start}"\n    end: "${(cmd as any).end}"`;
    case 'scroll': return '- scroll';
    case 'scrollUntilVisible': return selectorYaml('scrollUntilVisible', cmd);
    case 'assertVisible': return selectorYaml('assertVisible', cmd);
    case 'assertNotVisible': return selectorYaml('assertNotVisible', cmd);
    case 'back': return '- back';
    case 'pressKey': return `- pressKey: ${(cmd as any).key}`;
    case 'openLink': return `- openLink: "${esc((cmd as any).url)}"`;
    case 'hideKeyboard': return '- hideKeyboard';
    case 'waitForAnimationToEnd': return '- waitForAnimationToEnd';
    case 'takeScreenshot': return '- takeScreenshot';
    default: return `# ${(cmd as any).type}`;
  }
}

function selectorYaml(name: string, cmd: any): string {
  const sel = cmd.selector;
  if (!sel) return `- ${name}`;
  switch (sel.kind) {
    case 'text': return `- ${name}: "${esc(sel.text)}"`;
    case 'id': return `- ${name}:\n    id: "${esc(sel.id)}"`;
    case 'contentDescription': return `- ${name}: "${esc(sel.description)}"`;
    case 'relative': return `- ${name}:\n    ${sel.relation}: "${esc(sel.anchor)}"`;
    case 'point': return `- ${name}:\n    point: "${sel.x},${sel.y}"`;
    default: return `- ${name}`;
  }
}

function esc(s: string): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
