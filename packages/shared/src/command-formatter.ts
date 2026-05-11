import type { MaestroCommand } from './types.js';

export function formatCommandShort(cmd: MaestroCommand): string {
  const sel = (cmd as any).selector;
  const selectorStr = sel
    ? sel.kind === 'text' ? `"${sel.text}"`
    : sel.kind === 'id' ? `id: "${sel.id}"`
    : sel.kind === 'contentDescription' ? `"${sel.description}"`
    : sel.kind === 'relative' ? `${sel.relation}: "${sel.anchor}"`
    : `(${sel.x}%,${sel.y}%)`
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
