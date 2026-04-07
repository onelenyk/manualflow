import { useState, useEffect } from 'react';
import { useFlowStore, type FlowMeta } from '../../stores/flowStore';
import { api } from '../../api/client';
import { FlowEditor } from './FlowEditor';
import { RunViewer } from './RunViewer';

interface MaestroStatus {
  installed: boolean;
  version: string;
  binPath: string;
  devices: { serial: string; model: string }[];
  activeDevice: string | null;
}

export function FlowGallery() {
  const {
    flows, loading, error, activeRun, editingFlow,
    fetchFlows, deleteFlow, duplicateFlow, loadFlow, closeEditor,
  } = useFlowStore();

  const [maestro, setMaestro] = useState<MaestroStatus | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<string>('');

  const refreshMaestro = async () => {
    try {
      const s = await api.getMaestroStatus();
      setMaestro(s);
      if (!selectedDevice && s.activeDevice) setSelectedDevice(s.activeDevice);
      else if (!selectedDevice && s.devices.length > 0) setSelectedDevice(s.devices[0].serial);
    } catch {}
  };

  useEffect(() => {
    fetchFlows();
    refreshMaestro();
  }, []);

  const handleRun = (flowId: string) => {
    useFlowStore.getState().runFlowOnDevice(flowId, selectedDevice || undefined);
  };

  if (activeRun) return <RunViewer />;
  if (editingFlow) return <FlowEditor />;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Maestro Setup */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Test Runner</h2>
          <button onClick={refreshMaestro} className="text-xs text-slate-500 hover:text-white transition-colors">
            Refresh
          </button>
        </div>

        {maestro ? (
          <div className="flex flex-wrap items-center gap-4">
            {/* Maestro status */}
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${maestro.installed ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="text-xs text-slate-400">
                {maestro.installed ? `Maestro ${maestro.version}` : 'Maestro not installed'}
              </span>
            </div>

            {/* Device selector */}
            {maestro.devices.length > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Device:</span>
                <select
                  value={selectedDevice}
                  onChange={e => setSelectedDevice(e.target.value)}
                  className="px-2 py-1 text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-md focus:outline-none focus:border-blue-500"
                >
                  {maestro.devices.map(d => (
                    <option key={d.serial} value={d.serial}>
                      {d.model} ({d.serial.slice(0, 10)})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="text-xs text-slate-500">No devices connected</span>
            )}

            {!maestro.installed && (
              <div className="w-full mt-2 bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-400 mb-1">Install Maestro:</div>
                <pre className="text-[11px] text-slate-500 font-mono select-all">
                  curl -Ls "https://get.maestro.mobile.dev" | bash
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-slate-600">Checking Maestro...</div>
        )}

        {error && <div className="mt-2 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>}
      </div>

      {/* Flow list header */}
      <div className="flex items-center justify-between shrink-0">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Saved Flows</h3>
        <button onClick={fetchFlows} className="text-xs text-slate-500 hover:text-white transition-colors">
          Refresh
        </button>
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
                canRun={!!maestro?.installed && maestro.devices.length > 0}
                onRun={() => handleRun(flow.id)}
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

function FlowCard({ flow, canRun, onRun, onEdit, onDuplicate, onDelete }: {
  flow: FlowMeta;
  canRun: boolean;
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
            disabled={!canRun}
            className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-colors"
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
