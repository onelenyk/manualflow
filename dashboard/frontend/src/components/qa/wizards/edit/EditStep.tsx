import { useState, useEffect } from 'react';
import { api } from '../../../../api/client';

export interface EditStepProps {
  flowPath: string;
  onEditComplete?: (yaml: string) => void;
}

export function EditStep({ flowPath, onEditComplete }: EditStepProps) {
  const [yaml, setYaml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load flow YAML
    const loadFlow = async () => {
      try {
        const { yaml: flowYaml } = await api.getMaestroFlow(flowPath);
        setYaml(flowYaml);
      } catch (err) {
        setError('Failed to load test');
      } finally {
        setLoading(false);
      }
    };

    loadFlow();
  }, [flowPath]);

  // Auto-save draft
  useEffect(() => {
    if (!loading && yaml) {
      const saveDraft = async () => {
        try {
          await api.putMaestroDraft(flowPath, yaml);
        } catch (err) {
          // Silent fail for auto-save
        }
      };

      const timer = setTimeout(saveDraft, 800);
      return () => clearTimeout(timer);
    }
  }, [yaml, loading, flowPath]);

  const handleQuickAction = async (action: 'remove-last' | 'change-wait' | 'add-comment') => {
    // Quick actions are syntactic sugar over YAML edits
    let newYaml = yaml;

    switch (action) {
      case 'remove-last':
        // Remove last step (last non-empty line after ---)
        const lines = yaml.split('\n');
        const yamlIndex = lines.indexOf('---');
        if (yamlIndex >= 0) {
          const contentLines = lines.slice(yamlIndex + 1);
          const lastStepIndex = contentLines.findLastIndex((line) => line.trim().length > 0);
          if (lastStepIndex >= 0) {
            lines.splice(yamlIndex + 1 + lastStepIndex + 1, 1);
            newYaml = lines.join('\n');
          }
        }
        break;

      case 'change-wait':
        // Change wait time (simple example: add waitForAnimationToEnd)
        newYaml = yaml + '\n- waitForAnimationToEnd';
        break;

      case 'add-comment':
        // Add a comment
        newYaml = yaml + '\n# Comment: Add description here';
        break;
    }

    setYaml(newYaml);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <div className="text-sm text-slate-500">Loading test...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-400 mb-4">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quick actions */}
      <div className="p-4 bg-slate-800 rounded-lg">
        <div className="text-sm font-medium text-white mb-3">Quick actions</div>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleQuickAction('remove-last')}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-all"
          >
            Remove last action
          </button>
          <button
            onClick={() => handleQuickAction('change-wait')}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-all"
          >
            Change wait time
          </button>
          <button
            onClick={() => handleQuickAction('add-comment')}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-all"
          >
            Add a comment
          </button>
        </div>
      </div>

      {/* YAML editor */}
      <div className="flex-1">
        <textarea
          value={yaml}
          onChange={(e) => setYaml(e.target.value)}
          className="w-full h-64 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 resize-none"
          placeholder="Test steps will appear here..."
        />
      </div>

      {/* Save button */}
      <button
        onClick={() => onEditComplete && onEditComplete(yaml)}
        className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-base font-medium rounded-lg transition-all active:scale-95 min-h-[48px]"
      >
        Save
      </button>

      {/* Note about auto-save */}
      <div className="text-center text-xs text-slate-600">
        Changes are saved automatically
      </div>
    </div>
  );
}
