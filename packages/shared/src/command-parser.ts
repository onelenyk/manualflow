import type { MaestroCommand } from './types.js';

export function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }
  return t;
}

export function parseSelector(scalar: string | null, children: Record<string, string>) {
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

export function buildCommand(verb: string, scalar: string | null, children: Record<string, string>): MaestroCommand | null {
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

// --- YAML parsing (inverse of renderCommandYaml) ---
//
// Best-effort parser for the LLM-emitted enhanced YAML. Supports the same
// shapes that getYaml/renderCommandYaml produce, plus the small variants
// LLMs commonly emit (single quotes, unquoted strings, `text:` form on
// tapOn, etc). Unknown verbs are skipped silently.
export function parseCommandLines(yamlBody: string): MaestroCommand[] {
  const lines = yamlBody.split('\n');
  const commands: MaestroCommand[] = [];

  let i = 0;
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

  return commands;
}
