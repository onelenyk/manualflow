import { useMaestroProjectStore } from '../../stores/maestroProjectStore';
import type { MaestroFile } from '@maestro-recorder/shared';

export function QAHome({ onNavigate }: { onNavigate: (route: 'record' | 'run' | 'edit') => void }) {
  const project = useMaestroProjectStore((s) => s.project);

  // Get recent flows (last 3)
  const recentFlows = (project?.files.filter((f: MaestroFile) => f.kind === 'flow') ?? []).slice(0, 3);

  return (
    <div className="h-full flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-white mb-2">What would you like to do?</h1>
          <p className="text-sm text-slate-500">Choose an action to get started</p>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <ActionCard
            icon="🎙️"
            title="Record a test"
            description="Capture actions on your device"
            onClick={() => onNavigate('record')}
          />
          <ActionCard
            icon="▶️"
            title="Run a test"
            description="Run an existing test"
            onClick={() => onNavigate('run')}
          />
          <ActionCard
            icon="✏️"
            title="Edit a test"
            description="Make changes to a test"
            onClick={() => onNavigate('edit')}
          />
        </div>

        {/* Recent Tests */}
        {recentFlows.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Recent tests</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recentFlows.map((flow) => (
                <div
                  key={flow.path}
                  className="p-4 rounded-lg bg-slate-900/40 border border-slate-800/50 cursor-pointer hover:border-slate-700 transition-all"
                  onClick={() => onNavigate('run')}
                >
                  <div className="text-sm font-medium text-white">{flow.name}</div>
                  <div className="text-xs text-slate-500 mt-1">Click to run</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ActionCardProps {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
}

function ActionCard({ icon, title, description, onClick }: ActionCardProps) {
  return (
    <button
      onClick={onClick}
      className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/80 transition-all text-left"
    >
      <div className="text-3xl mb-3">{icon}</div>
      <div className="text-lg font-semibold text-white mb-1">{title}</div>
      <div className="text-sm text-slate-500">{description}</div>
    </button>
  );
}
