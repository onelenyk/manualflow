import { useRef, useEffect } from 'react';

export interface RunSseStreamProps {
  lines: string[];
}

export function RunSseStream({ lines }: RunSseStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  return (
    <div className="flex-1 min-h-0 bg-slate-900/60 rounded-xl border border-slate-800 p-4 overflow-auto">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 sticky top-0 bg-slate-900/60">Output</h3>
      <div className="font-mono text-[11px] text-slate-400 leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} className="hover:bg-slate-800/50 px-1">{line}</div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
