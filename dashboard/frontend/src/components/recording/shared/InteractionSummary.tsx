import type { RecordedInteraction } from '@maestro-recorder/shared';

export interface InteractionSummaryProps {
  interaction: RecordedInteraction;
  /** When true, render a more compact version (smaller paddings, fewer fields) */
  compact?: boolean;
}

function F({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="truncate">
      <span className="text-slate-600">{label}: </span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  );
}

export function InteractionSummary({ interaction, compact = false }: InteractionSummaryProps): JSX.Element {
  const a = interaction.touchAction;
  const el = interaction.element;
  const a11y = interaction.accessibilityEvents;
  const kbd = interaction.keyboardState;

  const spaceY = compact ? 'space-y-1' : 'space-y-1.5';
  const px = compact ? 'px-2' : 'px-3';
  const py = compact ? 'pb-1' : 'pb-2';

  return (
    <div className={`${px} ${py} ml-6 ${spaceY} text-[10px]`}>
      {/* Touch debug */}
      {a?.debug && (
        <div>
          <div className="text-slate-500 italic">{a.debug.reason}</div>
          <div className="flex gap-3 text-slate-600 font-mono">
            <span>dist: <span className="text-slate-400">{a.debug.endDistance}px</span></span>
            <span>maxDist: <span className="text-slate-400">{a.debug.maxDistFromStart}px</span></span>
            <span>dur: <span className="text-slate-400">{a.debug.durationMs}ms</span></span>
            <span>vel: <span className="text-slate-400">{a.debug.velocity}</span></span>
            <span>vert: <span className="text-slate-400">{a.debug.verticalRatio}</span></span>
          </div>
        </div>
      )}

      {/* Element details */}
      {el && (
        <div className="bg-slate-800/50 rounded px-2 py-1.5">
          <div className="text-purple-400 font-bold text-[9px] mb-1">ELEMENT</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {el.text && <F label="text" value={el.text} color="text-white" />}
            {el.resourceId && <F label="id" value={el.resourceId} color="text-green-400" />}
            {el.contentDescription && <F label="desc" value={el.contentDescription} color="text-cyan-400" />}
            {el.className && <F label="class" value={el.className} color="text-slate-400" />}
            {el.bounds && <F label="bounds" value={`(${el.bounds.left},${el.bounds.top})-(${el.bounds.right},${el.bounds.bottom})`} color="text-slate-500" />}
            <F label="clickable" value={String(el.clickable ?? false)} color={el.clickable ? 'text-green-400' : 'text-slate-600'} />
            <F label="editable" value={String(el.editable ?? false)} color={el.editable ? 'text-amber-400' : 'text-slate-600'} />
            <F label="focused" value={String(el.focused ?? false)} color={el.focused ? 'text-blue-400' : 'text-slate-600'} />
            <F label="scrollable" value={String((el as any).scrollable ?? false)} color={(el as any).scrollable ? 'text-indigo-400' : 'text-slate-600'} />
          </div>
        </div>
      )}

      {/* Accessibility events */}
      {a11y.length > 0 && (
        <div>
          <div className="text-orange-400 font-bold text-[9px] mb-1">A11Y EVENTS ({a11y.length})</div>
          {a11y.map((evt, i) => (
            <div key={i} className="flex items-center gap-2 text-slate-500 py-0.5">
              <span className="text-[9px] font-bold text-orange-400 bg-orange-400/10 px-1 rounded">{evt.type}</span>
              {evt.text && <span className="text-slate-300 font-mono">"{evt.text}"</span>}
              {evt.beforeText && <span className="text-slate-600 font-mono">was: "{evt.beforeText}"</span>}
              {evt.packageName && <span className="text-slate-600">{evt.packageName}</span>}
              {evt.direction && <span className="text-indigo-300">{evt.direction}</span>}
              {evt.className && <span className="text-slate-700">{evt.className.split('.').pop()}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Keyboard state */}
      {kbd && (
        <div className="text-slate-600">
          kbd: {kbd.open ? `open (top: ${kbd.top})` : 'closed'}
        </div>
      )}

      {/* Meta */}
      <div className="flex gap-3 text-slate-700">
        <span>source: {interaction.source}</span>
        <span>status: {interaction.status}</span>
        <span>ts: {interaction.timestampMs}</span>
        <span>screen: {interaction.screenWidth}x{interaction.screenHeight}</span>
      </div>
    </div>
  );
}
