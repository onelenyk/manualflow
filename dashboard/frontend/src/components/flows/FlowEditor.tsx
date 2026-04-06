import { useState } from 'react';
import { useFlowStore } from '../../stores/flowStore';

export function FlowEditor() {
  const { editingFlow, updateFlow, closeEditor, runFlow } = useFlowStore();
  const [yaml, setYaml] = useState(editingFlow?.yaml || '');
  const [name, setName] = useState(editingFlow?.name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!editingFlow) return null;

  const handleSave = async () => {
    setSaving(true);
    await updateFlow(editingFlow.id, { name, yaml });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleRun = () => {
    // Save first, then run
    updateFlow(editingFlow.id, { name, yaml }).then(() => runFlow(editingFlow.id));
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={closeEditor} className="text-sm text-slate-400 hover:text-white transition-colors">
              {'\u2190'} Back
            </button>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="text-sm font-medium bg-transparent text-white border-b border-transparent hover:border-slate-700 focus:border-blue-500 focus:outline-none px-1 py-0.5"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRun}
              className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
            >
              Save & Run
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg transition-colors"
            >
              {saved ? 'Saved!' : saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* YAML Editor */}
      <div className="flex-1 min-h-0 bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
        <textarea
          value={yaml}
          onChange={e => setYaml(e.target.value)}
          spellCheck={false}
          className="w-full h-full p-4 bg-transparent text-green-400 font-mono text-xs leading-relaxed resize-none focus:outline-none"
          placeholder="# Maestro YAML flow..."
        />
      </div>
    </div>
  );
}
