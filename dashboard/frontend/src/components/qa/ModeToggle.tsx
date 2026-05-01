import { useEffect } from 'react';

export type Mode = 'qa' | 'advanced';

export interface ModeToggleProps {
  current: Mode;
  onChange: (mode: Mode) => void;
}

const MODE_LABELS: Record<Mode, string> = {
  qa: 'Simple',
  advanced: 'Advanced',
};

export function ModeToggle({ current, onChange }: ModeToggleProps) {
  useEffect(() => {
    localStorage.setItem('manualflow.mode', current);
  }, [current]);

  const handleToggle = () => {
    const newMode: Mode = current === 'qa' ? 'advanced' : 'qa';
    onChange(newMode);
  };

  return (
    <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1">
      <button
        onClick={handleToggle}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
          current === 'qa'
            ? 'bg-blue-600 text-white'
            : 'text-slate-400 hover:text-white'
        }`}
      >
        {MODE_LABELS.qa}
      </button>
      <button
        onClick={handleToggle}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
          current === 'advanced'
            ? 'bg-blue-600 text-white'
            : 'text-slate-400 hover:text-white'
        }`}
      >
        {MODE_LABELS.advanced}
      </button>
    </div>
  );
}
