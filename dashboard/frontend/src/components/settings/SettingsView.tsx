import { useEffect, useState } from 'react';
import { StatusCard } from './StatusCard';

interface SystemHealth {
  agent: {
    installed: boolean;
    running: boolean;
    responsive: boolean;
    uiAutomationAlive: boolean;
    portForward: boolean;
    recovering: boolean;
    recoveryAttempts: number;
    build: { ready: boolean; exists: boolean; buildTime?: string };
    eventDiversity: { ok: boolean; recentTypes: string[]; warning: string | null };
  };
  infra: {
    device: { serial: string | null; connected: boolean };
    adb: boolean;
    mirror: { active: boolean };
  };
  maestro: {
    daemonRunning: boolean;
    testRunnerActive: boolean;
    conflictDetected: boolean;
  };
  env: {
    port: number;
    agentPort: number;
    openRouterConfigured: boolean;
    openRouterSource: 'stored' | 'env' | null;
    projectPath: string | null;
  };
}

export function SettingsView() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [stoppingDaemon, setStoppingDaemon] = useState(false);

  const resetOnboarding = () => {
    try {
      localStorage.removeItem('manualflow.onboarded');
      localStorage.removeItem('manualflow.setupSkipped');
      sessionStorage.setItem('manualflow.forceWizard', '1');
      window.location.reload();
    } catch {}
  };

  const fetchHealth = async () => {
    try {
      const resp = await fetch('/api/system/health');
      if (resp.ok) {
        setHealth(await resp.json());
      }
    } catch {}
    setLoading(false);
  };

  const stopMaestroDaemon = async () => {
    setStoppingDaemon(true);
    try {
      const resp = await fetch('/api/system/stop-maestro-daemon', { method: 'POST' });
      if (resp.ok) {
        await fetchHealth();
      }
    } catch {}
    setStoppingDaemon(false);
  };

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 5000);
    return () => clearInterval(id);
  }, []);

  if (loading || !health) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading system status...</div>
      </div>
    );
  }

  const agentStatus = health.agent.uiAutomationAlive
    ? 'healthy'
    : health.agent.running
      ? 'warning'
      : 'error';

  const infraStatus = health.infra.device.connected && health.infra.adb ? 'healthy' : 'error';

  const maestroStatus = health.maestro.conflictDetected
    ? 'error'
    : health.maestro.daemonRunning
      ? 'warning'
      : 'healthy';

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-200">Settings</h1>
          <p className="text-slate-500 text-sm mt-1">System status and configuration</p>
        </div>

        {/* Agent Status */}
        <StatusCard title="Recorder Agent" status={agentStatus}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Installed</span>
              <span className={health.agent.installed ? 'text-emerald-400' : 'text-red-400'}>
                {health.agent.installed ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Running</span>
              <span className={health.agent.running ? 'text-emerald-400' : 'text-red-400'}>
                {health.agent.running ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Responsive</span>
              <span className={health.agent.responsive ? 'text-emerald-400' : 'text-red-400'}>
                {health.agent.responsive ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">UiAutomation</span>
              <span className={health.agent.uiAutomationAlive ? 'text-emerald-400' : 'text-amber-400'}>
                {health.agent.uiAutomationAlive ? 'Alive' : 'Disconnected'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Event Diversity</span>
              <span className={health.agent.eventDiversity.ok ? 'text-emerald-400' : 'text-amber-400'}>
                {health.agent.eventDiversity.ok
                  ? `${health.agent.eventDiversity.recentTypes.length} types`
                  : 'Limited'}
              </span>
            </div>
            {health.agent.eventDiversity.warning && (
              <div className="text-amber-400 text-xs mt-2 p-2 bg-amber-950/50 rounded">
                {health.agent.eventDiversity.warning}
              </div>
            )}
            {health.agent.recovering && (
              <div className="text-amber-400 text-xs mt-2">
                Recovery in progress (attempt {health.agent.recoveryAttempts})
              </div>
            )}
          </div>
        </StatusCard>

        {/* Infrastructure Status */}
        <StatusCard title="Infrastructure" status={infraStatus}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Device</span>
              <span className={health.infra.device.connected ? 'text-emerald-400' : 'text-slate-500'}>
                {health.infra.device.serial || 'None'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">ADB</span>
              <span className={health.infra.adb ? 'text-emerald-400' : 'text-red-400'}>
                {health.infra.adb ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Screen Mirror</span>
              <span className={health.infra.mirror.active ? 'text-emerald-400' : 'text-slate-500'}>
                {health.infra.mirror.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </StatusCard>

        {/* Maestro Status */}
        <StatusCard
          title="Maestro Studio"
          status={maestroStatus}
          actions={
            health.maestro.daemonRunning ? (
              <button
                onClick={stopMaestroDaemon}
                disabled={stoppingDaemon}
                className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded text-white"
              >
                {stoppingDaemon ? 'Stopping...' : 'Stop Daemon'}
              </button>
            ) : null
          }
        >
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Daemon Running</span>
              <span className={health.maestro.daemonRunning ? 'text-amber-400' : 'text-emerald-400'}>
                {health.maestro.daemonRunning ? 'Yes (may block agent)' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Test Runner</span>
              <span className={health.maestro.testRunnerActive ? 'text-emerald-400' : 'text-slate-500'}>
                {health.maestro.testRunnerActive ? 'Active' : 'Idle'}
              </span>
            </div>
            {health.maestro.conflictDetected && (
              <div className="text-red-400 text-xs mt-2 p-2 bg-red-950/50 rounded">
                Maestro daemon is running and may block the recorder agent's UiAutomation access.
                Stop the daemon if you experience recording issues.
              </div>
            )}
          </div>
        </StatusCard>

        {/* Environment */}
        <StatusCard title="Environment" status="unknown">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Server Port</span>
              <span className="text-slate-300">{health.env.port}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Agent Port</span>
              <span className="text-slate-300">{health.env.agentPort}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">OpenRouter AI</span>
              <span className={health.env.openRouterConfigured ? 'text-emerald-400' : 'text-slate-500'}>
                {health.env.openRouterConfigured
                  ? `Configured (${health.env.openRouterSource})`
                  : 'Not configured'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Project Path</span>
              <span className="text-slate-400 text-xs max-w-md truncate">
                {health.env.projectPath || 'None selected'}
              </span>
            </div>
          </div>
        </StatusCard>

        {/* App */}
        <StatusCard title="App" status="unknown">
          <div className="space-y-2 text-sm">
            <button
              onClick={resetOnboarding}
              className="px-3 py-2 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300 w-full"
            >
              Reset onboarding wizard
            </button>
            <p className="text-slate-500 text-xs">
              This will reload the page and show the setup wizard again.
            </p>
          </div>
        </StatusCard>
      </div>
    </div>
  );
}
