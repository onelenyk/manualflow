import { useRef, useEffect } from 'react';
import { useRecordingStore } from '../../stores/recordingStore';
import type { CommandDto } from '../../types';

function formatCommand(cmd: CommandDto): string {
  switch (cmd.type) {
    case 'LaunchApp':
      return 'Launch App';
    case 'TapOn':
      if (!cmd.selector) return 'Tap';
      switch (cmd.selector.type) {
        case 'ById': return `Tap → id:${cmd.selector.value}`;
        case 'ByText': return `Tap → "${cmd.selector.value}"`;
        case 'ByContentDescription': return `Tap → [${cmd.selector.value}]`;
        case 'ByPoint': return `Tap → (${cmd.selector.value})`;
        default: return `Tap → ${cmd.selector.value}`;
      }
    case 'InputText':
      return `Input → "${cmd.text}"`;
    default:
      return cmd.type;
  }
}

function commandIcon(type: string): string {
  switch (type) {
    case 'LaunchApp': return '🚀';
    case 'TapOn': return '👆';
    case 'InputText': return '⌨️';
    default: return '•';
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
      <div className="text-slate-500 text-sm text-center py-8">
        No actions recorded yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
      {commands.map((cmd, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded text-sm"
        >
          <span className="text-xs">{commandIcon(cmd.type)}</span>
          <span className="text-slate-300">{formatCommand(cmd)}</span>
          <span className="ml-auto text-xs text-slate-600">#{i + 1}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
