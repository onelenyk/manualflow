import { WizardStepNav } from './WizardStepNav';

export interface WizardContainerProps {
  title?: string;
  step: number;
  totalSteps: number;
  onBack?: () => void;
  backLabel?: string;
  onForward?: () => void;
  forwardEnabled?: boolean;
  forwardLabel?: string;
  children: React.ReactNode;
}

export function WizardContainer({
  title,
  step,
  totalSteps,
  onBack,
  backLabel,
  onForward,
  forwardEnabled,
  forwardLabel,
  children,
}: WizardContainerProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6">
          <WizardStepNav
            step={step}
            totalSteps={totalSteps}
            title={title}
            onBack={onBack}
            backLabel={backLabel}
            onForward={onForward}
            forwardEnabled={forwardEnabled}
            forwardLabel={forwardLabel}
          />
        </div>

        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
