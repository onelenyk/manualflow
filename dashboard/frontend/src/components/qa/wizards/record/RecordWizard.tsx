import { useState } from 'react';
import { WizardContainer } from '../../shared/WizardContainer';
import { RecordPrepareStep } from './RecordPrepareStep';
import { RecordActiveStep } from './RecordActiveStep';
import { RecordSaveStep } from './RecordSaveStep';
import { api } from '../../../../api/client';

export function RecordWizard({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const handleStartRecording = async (serial: string) => {
    setStep(2);
    // Select device - recording is handled by the agent which is already connected
    try {
      await api.selectDevice(serial);
    } catch (err) {
      console.error('Failed to select device:', err);
    }
  };

  const handleStopRecording = () => {
    setStep(3);
  };

  const handleSave = () => {
    // Wizard complete - navigate back to home
    setTimeout(() => {
      onBack();
    }, 1500);
  };

  return (
    <WizardContainer
      title={step === 1 ? 'Record a test' : step === 2 ? undefined : 'Save test'}
      step={step}
      totalSteps={3}
      onBack={step === 1 ? onBack : undefined}
    >
      {step === 1 && <RecordPrepareStep onStartRecording={handleStartRecording} />}
      {step === 2 && (
        <RecordActiveStep onStop={handleStopRecording} />
      )}
      {step === 3 && <RecordSaveStep onSave={handleSave} />}
    </WizardContainer>
  );
}
