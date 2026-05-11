import { useEffect, useState } from 'react';
import { useStreamStore } from '../../../../stores/streamStore';
import { api } from '../../../../api/client';
import { useLiveFlowStore } from '../../../../stores/liveFlowStore';

export interface RecordSaveStepProps {
  onSave: (testName: string) => void;
  /** Reports whether the form is in a savable state — used by the wizard
      Forward button. Also receives a callback that triggers the same save
      action the internal Save Test button does, so Forward can invoke it. */
  onCanSaveChange?: (canSave: boolean, save: () => void) => void;
}

export function RecordSaveStep({ onSave, onCanSaveChange }: RecordSaveStepProps) {
  const interactions = useStreamStore((s) => s.interactions);
  const [testName, setTestName] = useState('');
  const [yamlDraft, setYamlDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Pre-fill with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    setTestName(`test-${timestamp}`);
    // Seed YAML preview from the live flow store; user can edit before save.
    setYamlDraft(useLiveFlowStore.getState().getYaml());
  }, []);

  const handleResetYaml = () => {
    setYamlDraft(useLiveFlowStore.getState().getYaml());
  };

  // Expose can-save state + a triggerable save action to the parent wizard so
  // its Forward button can mirror the internal Save Test button.
  useEffect(() => {
    if (!onCanSaveChange) return;
    const canSave = !isSaving && !saved && testName.trim().length > 0 && yamlDraft.trim().length > 0;
    onCanSaveChange(canSave, () => handleSave());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSaving, saved, testName, yamlDraft]);

  const handleSave = async () => {
    if (!testName.trim()) {
      setError('Please enter a test name');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Save the (possibly edited) preview YAML rather than re-reading the store,
      // so the user's last-minute edits land in the file.
      await api.saveMaestroFlow({
        path: `${testName}.yaml`,
        yaml: yamlDraft,
      });

      setSaved(true);
      setTimeout(() => {
        onSave(testName);
      }, 1500);
    } catch (err) {
      setError('Couldn\'t save. Retrying...');
      setIsSaving(false);
    }
  };

  const handleRetry = () => {
    handleSave();
  };

  // Success state with celebration
  if (saved) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-white mb-2">Test saved!</h2>
        <p className="text-sm text-slate-500">What's next?</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
          <div className="text-sm text-red-400">{error}</div>
        </div>
        <button
          onClick={handleRetry}
          className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-base font-medium rounded-lg transition-all active:scale-95 min-h-[48px]"
        >
          Retry now
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="text-center">
        <p className="text-sm text-slate-500">You recorded</p>
        <p className="text-2xl font-bold text-white">{interactions.length} actions</p>
      </div>

      {/* Name input */}
      <div>
        <label htmlFor="test-name" className="block text-sm font-medium text-white mb-2">
          Name this test
        </label>
        <input
          id="test-name"
          type="text"
          value={testName}
          onChange={(e) => setTestName(e.target.value)}
          placeholder="Enter test name"
          className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
          disabled={isSaving}
        />
      </div>

      {/* YAML preview (editable) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="yaml-preview" className="block text-sm font-medium text-white">
            YAML preview
          </label>
          <button
            type="button"
            onClick={handleResetYaml}
            className="text-[11px] text-slate-400 hover:text-white"
            disabled={isSaving}
          >
            Reset to recorded
          </button>
        </div>
        <textarea
          id="yaml-preview"
          value={yamlDraft}
          onChange={(e) => setYamlDraft(e.target.value)}
          spellCheck={false}
          rows={Math.min(20, Math.max(8, yamlDraft.split('\n').length + 1))}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 resize-y"
          disabled={isSaving}
        />
        <p className="text-[11px] text-slate-500 mt-1">
          Last-minute edits here will be saved to the file. Use "Reset" to discard.
        </p>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={isSaving || !testName.trim()}
        className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-base font-medium rounded-lg transition-all active:scale-95 min-h-[48px]"
      >
        {isSaving ? 'Saving...' : 'Save Test'}
      </button>
    </div>
  );
}
