import { useState } from 'react';
import { WizardContainer } from '../../shared/WizardContainer';
import { RunChooseStep } from './RunChooseStep';
import { RunActiveStep } from './RunActiveStep';
import { RunResultsStep } from './RunResultsStep';

export function RunWizard({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedFlowPath, setSelectedFlowPath] = useState<string | null>(null);

  const handleSelectTest = (flowPath: string) => {
    setSelectedFlowPath(flowPath);
    setStep(2);
  };

  const handleRunComplete = () => {
    setStep(3);
  };

  const handleRunAgain = () => {
    // Restart the run with same flow
    setStep(2);
  };

  const handleEdit = () => {
    // Navigate to edit wizard
    // For now, just go back to home
    onBack();
  };

  const handleBack = () => {
    if (step === 1) onBack();
    else if (step === 2) setStep(1);
    else if (step === 3) setStep(1);
  };

  const title =
    step === 1 ? 'Run a test' :
    step === 2 ? 'Running' :
    'Results';

  const backLabel = step === 1 ? 'Cancel' : 'Choose another';

  return (
    <WizardContainer
      title={title}
      step={step}
      totalSteps={3}
      onBack={handleBack}
      backLabel={backLabel}
    >
      {step === 1 && <RunChooseStep onSelectTest={handleSelectTest} />}
      {step === 2 && selectedFlowPath && (
        <RunActiveStep flowPath={selectedFlowPath} onComplete={handleRunComplete} />
      )}
      {step === 3 && <RunResultsStep onRunAgain={handleRunAgain} onEdit={handleEdit} />}
    </WizardContainer>
  );
}
