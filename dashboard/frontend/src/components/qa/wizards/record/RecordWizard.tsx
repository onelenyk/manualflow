import { useCallback, useRef, useState } from 'react';
import { WizardContainer } from '../../shared/WizardContainer';
import { RecordPrepareStep } from './RecordPrepareStep';
import { RecordActiveStep } from './RecordActiveStep';
import { RecordSaveStep } from './RecordSaveStep';
import { useDeviceStore } from '../../../../stores/deviceStore';
import { useLiveFlowStore } from '../../../../stores/liveFlowStore';
import { api } from '../../../../api/client';

export function RecordWizard({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const selectDevice = useDeviceStore((s) => s.selectDevice);

  // Step 1: track currently-picked device + app so the Forward button can
  // gate on device presence and so we can pin appId before recording starts.
  const [pickedDevice, setPickedDevice] = useState<string | null>(null);
  const [pickedApp, setPickedApp] = useState<string>('');

  // Step 3: track save-readiness + a triggerable save action exposed by the
  // save step so the wizard Forward button mirrors the Save Test button.
  const [canSave, setCanSave] = useState(false);
  const saveActionRef = useRef<() => void>(() => {});

  const handleStartRecording = async (serial: string) => {
    // Pin the chosen app id (if any) before transitioning so the live flow
    // store stops auto-detecting and uses the user's selection from the
    // first interaction onward.
    if (pickedApp) useLiveFlowStore.getState().setAppId(pickedApp);
    setStep(2);
    try {
      await selectDevice(serial);
    } catch (err) {
      console.error('Failed to select device:', err);
    }
  };

  const handleStopRecording = () => {
    setStep(3);
  };

  // From step 2 Back: stop recording on the server, then return to step 1.
  // Fire-and-forget: even if the call fails we still let the user back out.
  const handleAbortToPrepare = () => {
    void api.stopRecording().catch(() => {});
    setStep(1);
  };

  // From step 3 Back: return to step 1 (recording is already stopped). The
  // user's edits to the YAML draft are discarded by unmounting RecordSaveStep.
  const handleBackToPrepare = () => {
    setStep(1);
  };

  const handleSave = () => {
    // Wizard complete — navigate back to home.
    setTimeout(() => {
      onBack();
    }, 1500);
  };

  const onCanSaveChange = useCallback((can: boolean, save: () => void) => {
    setCanSave(can);
    saveActionRef.current = save;
  }, []);

  if (step === 2) {
    return (
      <RecordActiveStep
        onStop={handleStopRecording}
        onBackToPrepare={handleAbortToPrepare}
      />
    );
  }

  if (step === 1) {
    return (
      <WizardContainer
        title="Record a test"
        step={1}
        totalSteps={3}
        onBack={onBack}
        backLabel="Cancel"
        onForward={() => pickedDevice && handleStartRecording(pickedDevice)}
        forwardEnabled={!!pickedDevice}
        forwardLabel="Start Recording"
      >
        <RecordPrepareStep
          onStartRecording={handleStartRecording}
          onSelectedDeviceChange={setPickedDevice}
          onSelectedAppChange={setPickedApp}
        />
      </WizardContainer>
    );
  }

  // step === 3
  return (
    <WizardContainer
      title="Save test"
      step={3}
      totalSteps={3}
      onBack={handleBackToPrepare}
      backLabel="Record again"
      onForward={() => saveActionRef.current()}
      forwardEnabled={canSave}
      forwardLabel="Save"
    >
      <RecordSaveStep
        onSave={handleSave}
        onCanSaveChange={onCanSaveChange}
      />
    </WizardContainer>
  );
}
