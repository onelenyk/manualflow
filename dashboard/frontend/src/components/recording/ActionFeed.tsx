import { useRef, useEffect } from 'react';
import { useRecordingStore } from '../../stores/recordingStore';
import type { CommandDto } from '../../types';

function formatCommand(cmd: CommandDto): string {
  switch (cmd.type) {
    case 'LaunchApp': return 'Launch App';
    case 'TapOn':
      if (!cmd.selector) return 'Tap';
      switch (cmd.selector.type) {
        case 'ById': return `id:${cmd.selector.value}`;
        case 'ByText': return `"${cmd.selector.value}"`;
        case 'ByContentDescription': return `[${cmd.selector.value}]`;
        case 'ByPoint': return `(${cmd.selector.value})`;
        default: return cmd.selector.value || 'Tap';
      }
    case 'InputText': return `"${cmd.text}"`;
    default: return cmd.type;
  }
}

function commandLabel(type: string): { text: string; color: string } {
  switch (type) {
    case 'LaunchApp': return { text: 'LAUNCH', color: 'text-purple-400 bg-purple-400/10' };
    case 'TapOn': return { text: 'TAP', color: 'text-blue-400 bg-blue-400/10' };
    case 'InputText': return { text: 'INPUT', color: 'text-amber-400 bg-amber-400/10' };
    default: return { text: type, color: 'text-slate-400 bg-slate-400/10' };
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
