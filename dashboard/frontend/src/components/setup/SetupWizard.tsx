import { useEffect, useState } from 'react';
import { useDeviceStore } from '../../stores/deviceStore';
import { useSetupStore } from '../../stores/setupStore';
import { api } from '../../api/client';
import { getAiStatus, saveAiConfig, clearAiConfig, type AiStatus } from '../../api/ai';

interface SetupWizardProps {
  onComplete: () => void;
  onSkip?: () => void;
}

type StepId = 'device' | 'agent' | 'maestro' | 'ai';

const STEPS: { id: StepId; label: string; optional?: boolean }[] = [
  { id: 'device', label: 'Device' },
  { id: 'agent', label: 'Agent' },
  { id: 'maestro', label: 'Maestro', optional: true },
  { id: 'ai', label: 'AI', optional: true },
];

export function SetupWizard({ onComplete, onSkip }: SetupWizardProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const current = STEPS[stepIdx];

  const { devices, selectedDevice, fetchDevices, selectDevice, loading: devicesLoading } = useDeviceStore();
  const { agentInstalled, agentResponsive, agentStale, agentRecovering, streamConnected, agentBuildReady, agentStatus, check } = useSetupStore();

  const stepReady =
    current.id === 'device' ? !!selectedDevice :
    current.id === 'agent' ? (agentResponsive && !agentStale && !agentRecovering && streamConnected) :
    true;

  const next = () => {
    if (stepIdx < STEPS.length - 1) setStepIdx(stepIdx + 1);
    else onComplete();
  };
  const back = () => stepIdx > 0 && setStepIdx(stepIdx - 1);

  return (
    <div className="h-full w-full flex items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-2xl bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-white">Welcome to MaestroRecorder</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">Quick setup — takes about a minute.</p>
          </div>
          {onSkip && (
            <button
              onClick={onSkip}
              className="text-[11px] text-slate-500 hover:text-white transition-colors"
            >
              Skip setup
            </button>
          )}
        </div>

        {/* Stepper */}
        <div className="px-6 pt-4 flex items-center gap-2">
          {STEPS.map((s, i) => {
            const isActive = i === stepIdx;
            const isDone = i < stepIdx;
            return (
              <div key={s.id} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                    isDone ? 'bg-green-500 text-white' :
                    isActive ? 'bg-blue-600 text-white' :
                    'bg-slate-800 text-slate-500'
                  }`}
                >
                  {isDone ? '✓' : i + 1}
                </div>
                <span className={`text-xs ${isActive ? 'text-white' : 'text-slate-500'}`}>
                  {s.label}{s.optional ? <span className="text-slate-600"> (opt.)</span> : null}
                </span>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-px bg-slate-800" />
                )}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="px-6 py-5 min-h-[260px]">
          {current.id === 'device' && (
            <DeviceStep
              devices={devices}
              loading={devicesLoading}
              selectedDevice={selectedDevice}
              onRefresh={fetchDevices}
              onSelect={selectDevice}
            />
          )}
          {current.id === 'agent' && (
            <AgentStep
              installed={agentInstalled}
              responsive={agentResponsive}
              stale={agentStale}
              recovering={agentRecovering}
              recoveryAttempts={agentStatus?.recoveryAttempts ?? 0}
              streamConnected={streamConnected}
              refresh={check}
            />
          )}
          {current.id === 'maestro' && <MaestroStep />}
          {current.id === 'ai' && <AiStep />}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={back}
            disabled={stepIdx === 0}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            Back
          </button>
          <button
            onClick={next}
            disabled={!stepReady}
            className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {stepIdx === STEPS.length - 1 ? 'Finish' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Step: Device
// -----------------------------------------------------------------------------

function DeviceStep({
  devices, loading, selectedDevice, onRefresh, onSelect,
}: {
  devices: { serial: string; model?: string }[];
  loading: boolean;
  selectedDevice: string | null;
  onRefresh: () => void;
  onSelect: (serial: string) => void;
}) {
  useEffect(() => {
    onRefresh();
    const id = setInterval(onRefresh, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <h2 className="text-sm font-semibold text-white mb-1">Select a device</h2>
      <p className="text-[11px] text-slate-500 mb-4">
        Pick the connected emulator or physical device. Run <code className="text-slate-400">adb devices</code> to confirm it's visible.
      </p>

      {devices.length === 0 ? (
        <div className="bg-slate-800/40 border border-dashed border-slate-700 rounded-lg p-4 text-center">
          <div className="text-xs text-slate-400 mb-2">
            {loading ? 'Scanning for devices...' : 'No devices detected'}
          </div>
          <p className="text-[11px] text-slate-500 mb-3">
            Start an Android emulator or plug in a physical device with USB debugging enabled.
          </p>
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 text-[11px] bg-slate-700 hover:bg-slate-600 text-white rounded-md transition-colors"
          >
            Refresh
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {devices.map((d) => {
            const isSel = d.serial === selectedDevice;
            return (
              <button
                key={d.serial}
                onClick={() => onSelect(d.serial)}
                className={`text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center justify-between ${
                  isSel
                    ? 'bg-blue-500/10 border-blue-500/50'
                    : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'
                }`}
              >
                <div>
                  <div className="text-xs text-white">{d.model || d.serial}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{d.serial}</div>
                </div>
                {isSel && <span className="text-green-400 text-xs">✓ Selected</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Step: Agent
// -----------------------------------------------------------------------------

function AgentStep({
  installed, responsive, stale, recovering, recoveryAttempts, streamConnected, refresh,
}: {
  installed: boolean;
  responsive: boolean;
  stale: boolean;
  recovering: boolean;
  recoveryAttempts: number;
  streamConnected: boolean;
  refresh: () => Promise<void>;
}) {
  const { agentRunning, interactionCount, agentBuildReady } = useSetupStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  const handle = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setError(e.message || 'Action failed');
    }
    setBusy(null);
  };

  const restartAgent = async () => {
    await api.stopAgent().catch(() => {});
    await api.startAgent();
  };

  return (
    <div>
      <h2 className="text-sm font-semibold text-white mb-1">Enable the recorder agent</h2>
      <p className="text-[11px] text-slate-500 mb-4">
        The agent runs as an instrumentation on the device and streams UI element data while you record.
      </p>

      <div className="bg-slate-800/30 rounded-lg p-3 mb-4">
        <div className="grid grid-cols-5 gap-2">
          <StatusItem label="Built" active={agentBuildReady} detail={agentBuildReady ? 'Ready' : 'Not built'} />
          <StatusItem label="Installed" active={installed} detail={installed ? 'On device' : 'Not found'} />
          <StatusItem label="Running" active={agentRunning} detail={agentRunning ? 'Active' : 'Stopped'} />
          <StatusItem
            label="Responsive"
            active={responsive && !stale && !recovering}
            warn={stale || recovering}
            detail={
              recovering
                ? `Recovering${recoveryAttempts > 0 ? ` (${recoveryAttempts}/3)` : ''}`
                : stale
                  ? 'Stale'
                  : responsive
                    ? 'Replying'
                    : 'No reply'
            }
          />
          <StatusItem label="Streaming" active={streamConnected} detail={streamConnected ? `${interactionCount} events` : 'Disconnected'} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!agentBuildReady && (
          <ActionButton
            label="Build agent"
            color="blue"
            loading={busy === 'build'}
            onClick={() => handle('build', api.buildAgent)}
          />
        )}
        {agentBuildReady && !installed && (
          <ActionButton
            label="Install agent"
            color="blue"
            loading={busy === 'install'}
            onClick={() => handle('install', api.installAgent)}
          />
        )}
        {installed && !responsive && (
          <ActionButton
            label="Start agent"
            color="green"
            loading={busy === 'start'}
            onClick={() => handle('start', api.startAgent)}
          />
        )}
        {stale && (
          <ActionButton
            label="Restart agent"
            color="green"
            loading={busy === 'restart'}
            onClick={() => handle('restart', restartAgent)}
          />
        )}
        {responsive && !stale && !streamConnected && (
          <ActionButton
            label="Connect stream"
            color="green"
            loading={busy === 'reconnect'}
            onClick={() => handle('reconnect', api.reconnectStream)}
          />
        )}
        <button
          onClick={refresh}
          className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mt-3 text-[11px] text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
      )}

      {!agentBuildReady && (
        <div className="mt-4 text-[11px] text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
          Agent APK not built yet. Run <code className="text-slate-300">make build-agent</code> or click Build agent.
        </div>
      )}

      {recovering && (
        <div className="mt-4 text-[11px] text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
          Auto-recovery in progress{recoveryAttempts > 0 ? ` (attempt ${recoveryAttempts}/3)` : ''}…
        </div>
      )}

      {stale && !recovering && recoveryAttempts >= 3 && (
        <div className="mt-4 text-[11px] text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
          Auto-recovery exhausted after 3 attempts — click <strong>Restart agent</strong> to recover manually.
        </div>
      )}

      {stale && !recovering && recoveryAttempts < 3 && (
        <div className="mt-4 text-[11px] text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
          UiAutomation bridge lost — auto-recovery will retry shortly, or click <strong>Restart agent</strong>.
        </div>
      )}

      {responsive && !stale && !streamConnected && (
        <div className="mt-4 text-[11px] text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
          Agent replies but the data stream isn't connected yet — click <strong>Connect stream</strong>.
        </div>
      )}

      {streamConnected && !stale && (
        <div className="mt-4 text-[11px] text-green-400 bg-green-400/10 rounded-lg px-3 py-2">
          Agent connected and streaming. You're ready to continue.
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Step: Maestro (optional)
// -----------------------------------------------------------------------------

function MaestroStep() {
  const [status, setStatus] = useState<{ installed: boolean; version?: string } | null>(null);

  useEffect(() => {
    api.getMaestroStatus().then(setStatus).catch(() => setStatus({ installed: false }));
  }, []);

  return (
    <div>
      <h2 className="text-sm font-semibold text-white mb-1">Maestro CLI <span className="text-slate-500 text-[11px] font-normal">(optional)</span></h2>
      <p className="text-[11px] text-slate-500 mb-4">
        Maestro is needed to <em>run</em> recorded flows. You can record without it and install later.
      </p>

      {status === null ? (
        <div className="text-xs text-slate-500">Checking...</div>
      ) : status.installed ? (
        <div className="bg-green-400/10 border border-green-400/30 rounded-lg p-3">
          <div className="text-xs text-green-400">Maestro detected</div>
          {status.version && <div className="text-[11px] text-slate-400 font-mono mt-1">{status.version}</div>}
        </div>
      ) : (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-300 mb-1">Maestro not installed</div>
          <p className="text-[11px] text-slate-500 mb-2">Install later with:</p>
          <pre className="text-[11px] text-slate-400 font-mono bg-slate-950/60 rounded p-2 select-all">curl -fsSL "https://get.maestro.mobile.dev" | bash</pre>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Step: AI (optional)
// -----------------------------------------------------------------------------

function AiStep() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    let live = true;
    getAiStatus()
      .then(s => { if (live) setStatus(s); })
      .catch(e => { if (live) setError(e.message || 'Status check failed'); });
    return () => { live = false; };
  }, []);

  const refresh = async () => {
    try {
      const s = await getAiStatus();
      setStatus(s);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Status check failed');
    }
  };

  const onSave = async () => {
    if (!keyInput.trim()) return;
    setBusy('save');
    setError(null);
    try {
      const s = await saveAiConfig({
        apiKey: keyInput.trim(),
        model: modelInput.trim() || undefined,
      });
      setStatus(s);
      setKeyInput('');
      setModelInput('');
    } catch (e: any) {
      setError(e.message || 'Save failed');
    }
    setBusy(null);
  };

  const onClear = async () => {
    setBusy('clear');
    setError(null);
    try {
      const s = await clearAiConfig();
      setStatus(s);
    } catch (e: any) {
      setError(e.message || 'Clear failed');
    }
    setBusy(null);
  };

  return (
    <div>
      <h2 className="text-sm font-semibold text-white mb-1">
        AI Enhance <span className="text-slate-500 text-[11px] font-normal">(optional)</span>
      </h2>
      <p className="text-[11px] text-slate-500 mb-4">
        Lets the dashboard call OpenRouter to clean up recorded flows. Save a key here (stored at <code className="text-slate-400">~/.manualflow/ai.json</code>, mode 0600) or set <code className="text-slate-400">OPENROUTER_API_KEY</code> in the environment.
      </p>

      {status === null && !error && (
        <div className="text-xs text-slate-500">Checking…</div>
      )}

      {error && (
        <div className="mb-3 bg-red-400/10 border border-red-400/30 rounded-lg p-3 text-[11px] text-red-400">
          {error}
        </div>
      )}

      {status?.configured && (
        <div className="bg-green-400/10 border border-green-400/30 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs text-green-400">
                OpenRouter configured
                <span className="text-slate-400 font-normal ml-2">
                  ({status.source === 'stored' ? 'saved in dashboard' : 'from env'})
                </span>
              </div>
              {status.model && (
                <div className="text-[11px] text-slate-400 font-mono mt-1">{status.model}</div>
              )}
            </div>
            {status.source === 'stored' && (
              <button
                onClick={onClear}
                disabled={busy === 'clear'}
                className="px-2 py-1 text-[11px] bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded transition-colors"
              >
                {busy === 'clear' ? 'Clearing…' : 'Clear saved key'}
              </button>
            )}
          </div>
        </div>
      )}

      {status && !status.configured && (
        <div className="bg-amber-400/10 border border-amber-400/30 rounded-lg p-3 mb-3">
          <div className="text-xs text-amber-300 mb-1">OpenRouter not configured</div>
          <p className="text-[11px] text-slate-400">
            Missing: {status.missing.map((m, i) => (
              <span key={m}>
                {i > 0 && ', '}
                <code className="text-slate-200">{m}</code>
              </span>
            ))}
          </p>
        </div>
      )}

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
        <div className="text-[11px] text-slate-400 mb-2">
          {status?.configured && status.source === 'stored' ? 'Replace saved key' : 'Save key to dashboard'}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder="sk-or-..."
              autoComplete="off"
              spellCheck={false}
              className="flex-1 px-2.5 py-1.5 text-[11px] font-mono bg-slate-950/60 border border-slate-700 focus:border-purple-500 focus:outline-none text-white rounded"
            />
            <button
              onClick={() => setShowKey(v => !v)}
              type="button"
              className="px-2 py-1 text-[11px] bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            type="text"
            value={modelInput}
            onChange={e => setModelInput(e.target.value)}
            placeholder="Model (default: anthropic/claude-3.5-sonnet)"
            autoComplete="off"
            spellCheck={false}
            className="px-2.5 py-1.5 text-[11px] font-mono bg-slate-950/60 border border-slate-700 focus:border-purple-500 focus:outline-none text-white rounded"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={onSave}
              disabled={!keyInput.trim() || busy === 'save'}
              className="px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded transition-colors"
            >
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={refresh}
              className="px-3 py-1.5 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
            >
              Refresh
            </button>
            <p className="text-[10px] text-slate-500 ml-1">Stored locally on this machine.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function StatusItem({ label, active, detail, warn }: { label: string; active: boolean; detail: string; warn?: boolean }) {
  const containerClass = warn
    ? 'bg-amber-400/5 border-amber-400/30'
    : active
      ? 'bg-green-400/5 border-green-400/20'
      : 'bg-slate-800/30 border-slate-700/30';
  const dotClass = warn ? 'bg-amber-400' : active ? 'bg-green-400' : 'bg-slate-600';
  const labelClass = warn ? 'text-amber-400' : active ? 'text-green-400' : 'text-slate-500';
  const detailClass = warn ? 'text-amber-300' : active ? 'text-white' : 'text-slate-500';
  return (
    <div className={`flex flex-col items-center p-2 rounded-lg border transition-all ${containerClass}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        <span className={`text-[10px] uppercase tracking-wider font-medium ${labelClass}`}>
          {label}
        </span>
      </div>
      <span className={`text-[11px] font-medium ${detailClass}`}>
        {detail}
      </span>
    </div>
  );
}

function ActionButton({
  label, color, loading, onClick,
}: {
  label: string;
  color: 'blue' | 'green' | 'slate';
  loading: boolean;
  onClick: () => void;
}) {
  const colors = {
    blue: 'bg-blue-600 hover:bg-blue-500',
    green: 'bg-green-600 hover:bg-green-500',
    slate: 'bg-slate-700 hover:bg-slate-600',
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`px-3 py-1.5 text-xs font-medium ${colors[color]} disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-colors`}
    >
      {loading ? 'Working...' : label}
    </button>
  );
}
