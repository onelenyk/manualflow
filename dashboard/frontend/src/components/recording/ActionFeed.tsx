import { useRef, useEffect } from 'react';
import { useRecordingStore } from '../../stores/recordingStore';
import type { CommandDto } from '../../types';

function formatCommand(cmd: CommandDto): string {
  switch (cmd.type) {
    case 'launchApp': return 'Launch App';
    case 'tapOn': case 'TapOn': return formatSelector(cmd);
    case 'doubleTapOn': return formatSelector(cmd);
    case 'longPressOn': case 'LongPress': return formatSelector(cmd);
    case 'inputText': case 'InputText': return `"${cmd.text}"`;
    case 'eraseText': return 'Erase text';
    case 'swipe': case 'Swipe':
      if (cmd.direction) return cmd.direction;
      return `${cmd.start} → ${cmd.end}`;
    case 'scroll': return 'Scroll';
    case 'scrollUntilVisible': return formatSelector(cmd);
    case 'assertVisible': return formatSelector(cmd);
    case 'assertNotVisible': return formatSelector(cmd);
    case 'back': return 'Back';
    case 'pressKey': return cmd.key || 'Key';
    case 'openLink': return cmd.url || 'Link';
    case 'hideKeyboard': return 'Hide keyboard';
    case 'waitForAnimationToEnd': return 'Wait for animation';
    case 'takeScreenshot': return 'Screenshot';
    default: return cmd.type;
  }
}

function formatSelector(cmd: CommandDto): string {
  if (!cmd.selector) return '';
  switch (cmd.selector.type) {
    case 'ById': return `id:${cmd.selector.value}`;
    case 'ByText': return `"${cmd.selector.value}"`;
    case 'ByContentDescription': return `[${cmd.selector.value}]`;
    case 'ByPoint': return `(${cmd.selector.value})`;
    default: return cmd.selector.value || '';
  }
}

function commandLabel(type: string): { text: string; color: string } {
  switch (type) {
    case 'launchApp': return { text: 'LAUNCH', color: 'text-purple-400 bg-purple-400/10' };
    case 'tapOn': case 'TapOn': return { text: 'TAP', color: 'text-blue-400 bg-blue-400/10' };
    case 'doubleTapOn': return { text: '2xTAP', color: 'text-blue-300 bg-blue-300/10' };
    case 'longPressOn': case 'LongPress': return { text: 'LONG', color: 'text-orange-400 bg-orange-400/10' };
    case 'inputText': case 'InputText': return { text: 'INPUT', color: 'text-amber-400 bg-amber-400/10' };
    case 'eraseText': return { text: 'ERASE', color: 'text-amber-300 bg-amber-300/10' };
    case 'swipe': case 'Swipe': return { text: 'SWIPE', color: 'text-teal-400 bg-teal-400/10' };
    case 'scroll': return { text: 'SCROLL', color: 'text-indigo-400 bg-indigo-400/10' };
    case 'scrollUntilVisible': return { text: 'SCROLL', color: 'text-indigo-400 bg-indigo-400/10' };
    case 'assertVisible': return { text: 'ASSERT', color: 'text-green-400 bg-green-400/10' };
    case 'assertNotVisible': return { text: 'ASSERT!', color: 'text-green-300 bg-green-300/10' };
    case 'back': return { text: 'BACK', color: 'text-slate-400 bg-slate-400/10' };
    case 'pressKey': return { text: 'KEY', color: 'text-slate-400 bg-slate-400/10' };
    case 'waitForAnimationToEnd': return { text: 'WAIT', color: 'text-slate-400 bg-slate-400/10' };
    default: return { text: type.toUpperCase().slice(0, 6), color: 'text-slate-400 bg-slate-400/10' };
  }
}

export function ActionFeed() {
  const { commands } = useRecordingStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [commands.length]);

  if (commands.length === 0) {
    return (
      <div className="text-slate-600 text-xs text-center py-12">
        Actions will appear here during recording
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {commands.map((cmd, i) => {
        const label = commandLabel(cmd.type);
        return (
          <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors">
            <span className="text-[10px] text-slate-600 tabular-nums w-4 text-right shrink-0">{i + 1}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${label.color} shrink-0`}>
              {label.text}
            </span>
            <span className="text-xs text-slate-300 truncate">{formatCommand(cmd)}</span>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
