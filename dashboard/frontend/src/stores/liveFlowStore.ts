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
  processedInteractionIds: Set<number>; // Track which interactions have been added

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
  applyEnhanced: (yaml: string) => { ok: boolean; commandCount: number; appId?: string; error?: string };
  clear: () => void;
}

function makeId(nextId: number): string {
  return `e${nextId}`;
}

export const useLiveFlowStore = create<LiveFlowStore>((set, get) => ({
  entries: [],
  appId: 'com.unknown.app',
  nextId: 1,
  processedInteractionIds: new Set(),

  addFromInteraction: (interaction: Interaction) => {
    const store = get();

    // Deduplication: check if we already processed this interaction
    if (store.processedInteractionIds.has(interaction.id)) return;
    if (interaction.filteredAsKeyboardTap) return;
    if (interaction.status !== 'complete') return;

    // Mark as processed BEFORE adding to prevent race conditions
    set(s => ({
      processedInteractionIds: new Set(s.processedInteractionIds).add(interaction.id)
    }));

    // Auto-detect appId from interaction data
    if (get().appId === 'com.unknown.app') {
      const SYSTEM = ['systemui', 'inputmethod', 'launcher', 'nexuslauncher', 'gboard', 'latin', 'android'];
      let detected: string | null = null;

      // Try 1: from element resourceId prefix (most reliable — always available)
      const rid = interaction.element?.resourceId;
      if (rid && rid.includes(':id/')) {
        const pkg = rid.split(':id/')[0];
        if (pkg && !SYSTEM.some(s => pkg.includes(s))) {
          detected = pkg;
        }
      }

      // Try 2: from accessibility event packageName
      if (!detected) {
        for (const evt of interaction.accessibilityEvents) {
          const pkg = evt.packageName;
          if (pkg && !SYSTEM.some(s => pkg.includes(s))) {
            detected = pkg;
            break;
          }
        }
      }

      if (detected) set({ appId: detected });
    }

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

  applyEnhanced: (yaml: string) => {
    const parsed = parseEnhancedYaml(yaml);
    if (parsed.commands.length === 0) {
      return { ok: false, commandCount: 0, error: 'Could not parse any commands from the enhanced YAML' };
    }
    set(s => {
      let id = s.nextId;
      const newEntries: FlowEntry[] = parsed.commands.map(cmd => ({
        id: makeId(id++),
        command: cmd,
        source: 'manual' as const,
      }));
      return {
        entries: newEntries,
        nextId: id,
        appId: parsed.appId || s.appId,
      };
    });
    return { ok: true, commandCount: parsed.commands.length, appId: parsed.appId || undefined };
  },

  clear: () => set({ entries: [], nextId: 1, processedInteractionIds: new Set() }),
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
    case 'point': return `- ${name}:\n    point: "${sel.x}%,${sel.y}%"`;
    default: return `- ${name}`;
  }
}

function esc(s: string): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// --- YAML parsing (inverse of renderCommandYaml) ---
//
// Best-effort parser for the LLM-emitted enhanced YAML. Supports the same
// shapes that getYaml/renderCommandYaml produce, plus the small variants
// LLMs commonly emit (single quotes, unquoted strings, `text:` form on
// tapOn, etc). Unknown verbs are skipped silently.

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }
  return t;
}

function parseSelector(scalar: string | null, children: Record<string, string>) {
  if (children.id) return { kind: 'id', id: children.id } as any;
  if (children.text) return { kind: 'text', text: children.text } as any;
  if (children.contentDescription) return { kind: 'contentDescription', description: children.contentDescription } as any;
  if (children.point) {
    const m = children.point.match(/^(\d+)%\s*,\s*(\d+)%$/);
    if (m) return { kind: 'point', x: parseInt(m[1], 10), y: parseInt(m[2], 10) } as any;
  }
  for (const rel of ['above', 'below', 'leftOf', 'rightOf', 'containsChild', 'containsDescendants']) {
    if (children[rel]) return { kind: 'relative', relation: rel, anchor: children[rel] } as any;
  }
  if (scalar) {
    const text = stripQuotes(scalar);
    if (text) return { kind: 'text', text } as any;
  }
  return undefined;
}

function buildCommand(verb: string, scalar: string | null, children: Record<string, string>): MaestroCommand | null {
  switch (verb) {
    case 'launchApp':
      return null; // omitted from entries — getYaml prepends it automatically
    case 'tapOn':
    case 'doubleTapOn':
    case 'longPressOn':
    case 'scrollUntilVisible':
    case 'assertVisible':
    case 'assertNotVisible':
      return { type: verb, selector: parseSelector(scalar, children) } as any;
    case 'inputText':
      if (!scalar) return null;
      return { type: 'inputText', text: stripQuotes(scalar) } as any;
    case 'eraseText':
      if (scalar && /^\d+$/.test(scalar)) return { type: 'eraseText', chars: parseInt(scalar, 10) } as any;
      return { type: 'eraseText' } as any;
    case 'swipe':
      if (children.direction) return { type: 'swipe', direction: children.direction } as any;
      if (children.start && children.end) return { type: 'swipe', start: children.start, end: children.end } as any;
      return null;
    case 'scroll': return { type: 'scroll' } as any;
    case 'back': return { type: 'back' } as any;
    case 'pressKey':
      if (!scalar) return null;
      return { type: 'pressKey', key: stripQuotes(scalar) } as any;
    case 'openLink':
      if (!scalar) return null;
      return { type: 'openLink', url: stripQuotes(scalar) } as any;
    case 'hideKeyboard': return { type: 'hideKeyboard' } as any;
    case 'waitForAnimationToEnd': return { type: 'waitForAnimationToEnd' } as any;
    case 'takeScreenshot': return { type: 'takeScreenshot' } as any;
    default: return null;
  }
}

function parseEnhancedYaml(yaml: string): { appId: string | null; commands: MaestroCommand[] } {
  const lines = yaml.split('\n');
  let appId: string | null = null;
  const commands: MaestroCommand[] = [];

  // Locate body — everything after `---`. If no `---` is found, treat the
  // whole file as the body (LLM may omit the front-matter separator).
  let bodyStart = 0;
  let foundSeparator = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const m = t.match(/^appId:\s*(.+)$/);
    if (m) appId = stripQuotes(m[1]);
    if (t === '---') { bodyStart = i + 1; foundSeparator = true; break; }
  }
  if (!foundSeparator) bodyStart = 0;

  let i = bodyStart;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) { i++; continue; }
    if (!trimmed.startsWith('-')) { i++; continue; }

    // Strip leading "- " (or "-")
    const head = trimmed.replace(/^-\s*/, '');
    const colonIdx = head.indexOf(':');
    let verb: string;
    let scalar: string | null = null;
    if (colonIdx === -1) {
      verb = head.trim();
    } else {
      verb = head.slice(0, colonIdx).trim();
      const rest = head.slice(colonIdx + 1).trim();
      scalar = rest === '' ? null : rest;
    }

    const headIndent = line.match(/^\s*/)?.[0].length ?? 0;
    const children: Record<string, string> = {};
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      if (!next.trim()) { j++; continue; }
      const nextIndent = next.match(/^\s*/)?.[0].length ?? 0;
      if (nextIndent <= headIndent) break;
      if (next.trim().startsWith('-')) break; // sibling list item
      const cm = next.match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
      if (cm) children[cm[1]] = stripQuotes(cm[2]);
      j++;
    }
    i = j;

    const cmd = buildCommand(verb, scalar, children);
    if (cmd) commands.push(cmd);
  }

  return { appId, commands };
}
