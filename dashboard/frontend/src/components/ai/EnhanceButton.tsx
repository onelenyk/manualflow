import React from 'react';

interface EnhanceButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isEnhancing?: boolean;
  variant?: 'primary' | 'secondary';
}

export function EnhanceButton({ onClick, disabled = false, isEnhancing = false, variant = 'secondary' }: EnhanceButtonProps) {
  const baseClasses = 'px-2 py-1 text-[11px] rounded transition-colors flex items-center gap-1';

  const variantClasses = variant === 'primary'
    ? 'bg-purple-600 hover:bg-purple-500 text-white disabled:bg-slate-700'
    : 'bg-slate-700 hover:bg-slate-600 text-white disabled:bg-slate-800';

  return (
    <button
      onClick={onClick}
      disabled={disabled || isEnhancing}
      className={`${baseClasses} ${variantClasses}`}
    >
      {isEnhancing ? (
        <>
          <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Enhancing...
        </>
      ) : (
        <>
          <span>✨</span>
          Enhance
        </>
      )}
    </button>
  );
}
