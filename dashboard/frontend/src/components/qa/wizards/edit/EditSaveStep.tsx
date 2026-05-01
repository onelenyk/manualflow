import { useState } from 'react';
import { api } from '../../../../api/client';

export interface EditSaveStepProps {
  flowPath: string;
  yaml: string;
  onSave: () => void;
  onCancel: () => void;
}

export function EditSaveStep({ flowPath, yaml, onSave, onCancel }: EditSaveStepProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Count changes (rough estimate by line count)
  const changeCount = yaml.split('\n').filter((line) => line.trim().length > 0).length;

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      await api.saveMaestroFlow({ path: flowPath, yaml });
      onSave();
    } catch (err) {
      setError('Couldn\'t save. Please try again.');
      setSaving(false);
    }
  };

  const handleRetry = () => {
    handleSave();
  };

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
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
        <p className="text-sm text-slate-500">You made</p>
        <p className="text-2xl font-bold text-white">{changeCount} lines</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-base font-medium rounded-lg transition-all active:scale-95 min-h-[48px]"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white text-base font-medium rounded-lg transition-all active:scale-95 min-h-[48px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
