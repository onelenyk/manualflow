export interface WizardContainerProps {
  title?: string;
  step: number;
  totalSteps: number;
  onBack?: () => void;
  children: React.ReactNode;
}

export function WizardContainer({ title, step, totalSteps, onBack, children }: WizardContainerProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Step indicator */}
        <div className="mb-6 text-center">
          <div className="text-sm text-slate-500">
            Step {step} of {totalSteps}
          </div>
          {title && <h2 className="text-xl font-semibold text-white mt-2">{title}</h2>}
        </div>

        {/* Back button */}
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        )}

        {/* Content */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
