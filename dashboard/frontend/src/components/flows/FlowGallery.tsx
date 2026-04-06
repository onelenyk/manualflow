import { useState, useEffect } from 'react';
import { useFlowStore, type FlowMeta, type RunState } from '../../stores/flowStore';
import { FlowEditor } from './FlowEditor';
import { RunViewer } from './RunViewer';

export function FlowGallery() {
  const {
    flows, loading, error, activeRun, editingFlow,
    fetchFlows, deleteFlow, duplicateFlow, loadFlow, runFlow, clearRun, closeEditor,
  } = useFlowStore();

  useEffect(() => { fetchFlows(); }, []);

  // If there's an active run, show the run viewer
  if (activeRun) {
    return <RunViewer />;
  }

  // If editing a flow, show the editor
  if (editingFlow) {
    return <FlowEditor />;
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Test Flows</h2>
          <button
            onClick={fetchFlows}
            className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>
        {error && <div className="mt-2 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>}
      </div>

      {/* Flow list */}
      <div className="flex-1 min-h-0 overflow-auto">
        {loading ? (
          <div className="text-slate-600 text-xs text-center py-12">Loading...</div>
        ) : flows.length === 0 ? (
          <div className="text-slate-600 text-xs text-center py-12">
            No flows saved yet. Record interactions and save from the Flow Builder.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {flows.map(flow => (
              <FlowCard
                key={flow.id}
                flow={flow}
                onRun={() => runFlow(flow.id)}
                onEdit={() => loadFlow(flow.id)}
                onDuplicate={() => duplicateFlow(flow.id, `${flow.name} (copy)`)}
                onDelete={() => { if (confirm(`Delete "${flow.name}"?`)) deleteFlow(flow.id); }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FlowCard({ flow, onRun, onEdit, onDuplicate, onDelete }: {
  flow: FlowMeta;
  onRun: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const date = new Date(flow.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-white">{flow.name}</h3>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
            <span>{flow.commandCount} commands</span>
            <span>{date}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRun}
            className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
          >
            Run
          </button>
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDuplicate}
            className="px-2 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Dup
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            Del
          </button>
        </div>
      </div>
    </div>
  );
}
