import { useState } from 'react';
import { WizardContainer } from '../../shared/WizardContainer';
import { RunChooseStep } from '../run/RunChooseStep';
import { EditStep } from './EditStep';
import { EditSaveStep } from './EditSaveStep';

export function EditWizard({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedFlowPath, setSelectedFlowPath] = useState<string | null>(null);
  const [currentYaml, setCurrentYaml] = useState<string>('');

  const handleSelectTest = (flowPath: string) => {
    setSelectedFlowPath(flowPath);
    setStep(2);
  };

  const handleEditComplete = (yaml: string) => {
    setCurrentYaml(yaml);
    setStep(3);
  };

  const handleSave = () => {
    // Save complete, navigate back to home
    setTimeout(() => {
      onBack();
    }, 1500);
  };

  const handleCancel = () => {
    onBack();
  };

  const handleBack = () => {
    if (step === 1) onBack();
    else if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const title =
    step === 1 ? 'Edit a test' :
    step === 2 ? 'Edit YAML' :
    'Save changes';

  const backLabel =
    step === 1 ? 'Cancel' :
    step === 2 ? 'Choose another' :
    'Back to edit';

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
        <EditStep flowPath={selectedFlowPath} onEditComplete={handleEditComplete} />
      )}
      {step === 3 && selectedFlowPath && currentYaml && (
        <EditSaveStep flowPath={selectedFlowPath} yaml={currentYaml} onSave={handleSave} onCancel={handleCancel} />
      )}
    </WizardContainer>
  );
}
