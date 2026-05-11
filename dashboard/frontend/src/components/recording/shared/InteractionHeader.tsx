import type { RecordedInteraction } from '@maestro-recorder/shared';

export interface InteractionHeaderProps {
  interaction: RecordedInteraction;
  /** 1-based sequence number within the visible list */
  sequenceIndex: number;
  expanded: boolean;
  onToggleExpand: () => void;
  /** When provided, render an `×` button that removes just this interaction. */
  onRemove?: () => void;
}

const actionColors: Record<string, string> = {
  tap: 'bg-blue-500',
  swipe: 'bg-teal-500',
  longPress: 'bg-orange-500',
  scroll: 'bg-indigo-500',
};

export function InteractionHeader({
  interaction,
  sequenceIndex,
  expanded,
  onToggleExpand,
  onRemove,
}: InteractionHeaderProps) {
  const a = interaction.touchAction;
  const el = interaction.element;
  const a11y = interaction.accessibilityEvents;
  const isA11yOnly = interaction.source === 'accessibility';

  const elSummary = el?.text
    ? `"${el.text.slice(0, 25)}"`
    : el?.resourceId
      ? `#${(el.resourceId || '').split(':id/').pop()}`
      : el?.contentDescription?.slice(0, 25)
        || '';

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] cursor-pointer hover:bg-slate-800/30 rounded transition-colors"
      onClick={onToggleExpand}
    >
      <span className="font-bold text-white text-[11px] bg-slate-700 rounded px-1.5 py-0.5 shrink-0 min-w-[2.5rem] text-center">
        Step {sequenceIndex}
      </span>

      {interaction.filteredAsKeyboardTap && (
        <span className="font-bold text-white px-1 py-0.5 rounded bg-slate-600 text-[10px]">KBD</span>
      )}

      {a && (
        <span className={`font-bold text-white px-1 py-0.5 rounded text-[10px] ${actionColors[a.type] || 'bg-slate-500'}`}>
          {a.type.toUpperCase()}
        </span>
      )}

      {isA11yOnly && a11y[0] && (
        <span className="font-bold text-white px-1 py-0.5 rounded text-[10px] bg-purple-500">
          {a11y[0].type.toUpperCase()}
        </span>
      )}

      {a?.type === 'tap' && (
        <span className="text-yellow-400 font-mono text-[10px]">
          ({(a as any).x},{(a as any).y})
        </span>
      )}
      {a?.type === 'longPress' && (
        <span className="text-yellow-400 font-mono text-[10px]">
          ({(a as any).x},{(a as any).y}) {Math.round((a as any).durationMs)}ms
        </span>
      )}
      {a?.type === 'scroll' && (
        <span className="text-indigo-300 font-mono text-[10px]">{(a as any).direction}</span>
      )}
      {a?.type === 'swipe' && (
        <span className="text-teal-300 font-mono text-[10px]">
          ({(a as any).startX},{(a as any).startY}){'→'}({(a as any).endX},{(a as any).endY})
        </span>
      )}

      {elSummary && <span className="text-slate-400 text-[10px] truncate">{elSummary}</span>}

      {isA11yOnly && a11y[0]?.text && !elSummary && (
        <span className="text-slate-400 text-[10px] truncate">"{a11y[0].text.slice(0, 25)}"</span>
      )}

      <div className="ml-auto flex items-center gap-1 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
          className="text-slate-600 hover:text-white text-[10px] px-1"
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
        >
          {expanded ? '▼' : '▶'}
        </button>
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-slate-700 hover:text-red-400 text-[12px] px-1"
            aria-label="Remove this interaction"
            title="Remove this interaction"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
