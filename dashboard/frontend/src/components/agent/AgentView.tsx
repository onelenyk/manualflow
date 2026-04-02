import { useState, useEffect } from 'react';
import { useDeviceStore } from '../../stores/deviceStore';
import { api } from '../../api/client';

interface AgentStatus {
  installed: boolean;
  running: boolean;
  responsive: boolean;
  error?: string;
}

export function AgentView() {
  const { selectedDevice } = useDeviceStore();
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [building, setBuilding] = useState(false);

  const log = (msg: string) => setActionLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const refresh = async () => {
    if (!selectedDevice) { setStatus(null); return; }
    try {
      const s = await api.getAgentStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [selectedDevice]);

  const handleAction = async (action: string, fn: () => Promise<any>) => {
    setLoading(true);
    log(`${action}...`);
    try {
      const result = await fn();
      log(`${action}: ${result.status || result.warning || 'done'}`);
      await refresh();
    } catch (e: any) {
      log(`${action} failed: ${e.message}`);
    }
    setLoading(false);
  };

  const handleBuild = async () => {
    setBuilding(true);
    log('Building agent APK...');
    try {
      const result = await api.buildAgent();
      log(`Build: ${result.status}`);
    } catch (e: any) {
      log(`Build failed: ${e.message}`);
    }
    setBuilding(false);
  };

  if (!selectedDevice) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-600 text-xs">Select a device to manage the agent</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Status card */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
        <h2 className="text-sm font-semibold text-white mb-3">Instrumentation Agent</h2>
        <p className="text-xs text-slate-500 mb-4">
          The agent runs on the Android device and provides UI element data for recording.
        </p>

        {status ? (
          <div className="flex gap-4 mb-4">
            <StatusBadge label="Installed" active={status.installed} />
            <StatusBadge label="Running" active={status.running} />
            <StatusBadge label="Responsive" active={status.responsive} />
          </div>
        ) : (
          <div className="text-xs text-slate-600 mb-4">Checking status...</div>
        )}

        {status?.error && (
          <div className="text-[11px] text-red-400 bg-red-400/10 rounded-lg px-3 py-2 mb-4">{status.error}</div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {!status?.installed && (
            <ActionButton
              label="Install Agent" color="blue" loading={loading}
              onClick={() => handleAction('Install', api.installAgent)}
            />
          )}

          {status?.installed && !status?.running && (
            <ActionButton
              label="Start Agent" color="green" loading={loading}
              onClick={() => handleAction('Start', api.startAgent)}
            />
          )}

          {status?.running && (
            <ActionButton
              label="Stop Agent" color="slate" loading={loading}
              onClick={() => handleAction('Stop', api.stopAgent)}
            />
          )}

          {status?.installed && !status?.running && (
            <ActionButton
              label="Uninstall" color="red" loading={loading}
              onClick={() => handleAction('Uninstall', api.uninstallAgent)}
            />
          )}

          <ActionButton
            label={building ? 'Building...' : 'Build APK'} color="slate" loading={building}
            onClick={handleBuild}
          />

          <button
            onClick={refresh}
            className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-all"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Log */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 flex-1 min-h-0 flex flex-col">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 shrink-0">Activity Log</h3>
        <div className="flex-1 overflow-auto">
          {actionLog.length === 0 ? (
            <div className="text-slate-600 text-xs text-center py-8">No activity yet</div>
          ) : (
            <div className="flex flex-col gap-1">
              {actionLog.map((line, i) => (
                <div key={i} className="text-[11px] text-slate-400 font-mono px-2 py-1 hover:bg-slate-800/50 rounded">
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Manual Setup</h3>
        <pre className="text-[10px] text-slate-500 font-mono leading-relaxed select-all">
{`# Build APK
./gradlew :agent:assembleDebugAndroidTest

# Install on device
adb install -r -t agent/build/outputs/apk/androidTest/debug/agent-debug-androidTest.apk

# Start agent
adb shell am instrument -w -e class \\
  com.maestrorecorder.agent.RecorderInstrumentation#startServer \\
  com.maestrorecorder.agent.test/androidx.test.runner.AndroidJUnitRunner`}
        </pre>
      </div>
    </div>
  );
}

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${active ? 'bg-green-400' : 'bg-slate-600'}`} />
      <span className={`text-[11px] ${active ? 'text-green-400' : 'text-slate-600'}`}>{label}</span>
    </div>
  );
}

function ActionButton({ label, color, loading, onClick }: {
  label: string; color: string; loading: boolean; onClick: () => void;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-600 hover:bg-blue-500',
    green: 'bg-green-600 hover:bg-green-500',
    red: 'bg-red-600 hover:bg-red-500',
    slate: 'bg-slate-700 hover:bg-slate-600',
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`px-3 py-1.5 text-xs font-medium ${colors[color] || colors.slate} disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-all`}
    >
      {label}
    </button>
  );
}
