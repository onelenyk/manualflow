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

  return (
    <WizardContainer
      title={step === 1 ? 'Edit a test' : step === 2 ? undefined : 'Save changes'}
      step={step}
      totalSteps={3}
      onBack={step === 1 ? onBack : undefined}
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
