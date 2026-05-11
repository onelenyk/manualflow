export interface WizardStepNavProps {
  step: number;
  totalSteps: number;
  title?: string;
  onBack?: () => void;
  backLabel?: string;
  onForward?: () => void;
  forwardEnabled?: boolean;
  forwardLabel?: string;
}

/**
 * Shared top-bar for every wizard step: Back arrow + step counter + optional title
 * + Forward arrow. Buttons disable themselves when the matching handler is
 * absent, and the Forward button additionally respects `forwardEnabled`.
 */
export function WizardStepNav({
  step,
  totalSteps,
  title,
  onBack,
  backLabel = 'Back',
  onForward,
  forwardEnabled = false,
  forwardLabel = 'Next',
}: WizardStepNavProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onBack}
        disabled={!onBack}
        className="flex items-center gap-1 px-2 py-1 text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label={backLabel}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {backLabel}
      </button>

      <div className="text-center">
        <div className="text-sm text-slate-500">
          Step {step} of {totalSteps}
        </div>
        {title && <h2 className="text-xl font-semibold text-white mt-1">{title}</h2>}
      </div>

      <button
        type="button"
        onClick={onForward}
        disabled={!onForward || !forwardEnabled}
        className="flex items-center gap-1 px-2 py-1 text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label={forwardLabel}
      >
        {forwardLabel}
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
