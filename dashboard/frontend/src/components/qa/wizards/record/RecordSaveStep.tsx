import { useEffect, useState } from 'react';
import { useStreamStore } from '../../../../stores/streamStore';
import { api } from '../../../../api/client';
import { useMaestroProjectStore } from '../../../../stores/maestroProjectStore';

export interface RecordSaveStepProps {
  onSave: (testName: string) => void;
}

export function RecordSaveStep({ onSave }: RecordSaveStepProps) {
  const interactions = useStreamStore((s) => s.interactions);
  const project = useMaestroProjectStore((s) => s.project);
  const [testName, setTestName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Pre-fill with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    setTestName(`test-${timestamp}`);
  }, []);

  const handleSave = async () => {
    if (!testName.trim()) {
      setError('Please enter a test name');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Export all interactions to YAML
      const interactionIds = interactions.map((i) => i.id);
      const response = await fetch('/api/stream/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: project?.rules?.parsed?.appId || 'com.example.app',
          interactionIds,
        }),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const exportResult = await response.json();

      // Save to Maestro project
      await api.saveMaestroFlow({
        path: `${testName}.yaml`,
        yaml: exportResult.yaml,
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
