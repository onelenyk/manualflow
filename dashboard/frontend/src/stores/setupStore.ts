import { create } from 'zustand';
import { api } from '../api/client';

const ONBOARDED_KEY = 'manualflow.onboarded';
const LEGACY_SKIP_KEY = 'manualflow.setupSkipped';

interface BuildStatus {
  ready: boolean;
  exists: boolean;
  buildTime?: string;
}

interface AgentStatus {
  ready: boolean;
  build: BuildStatus;
  installed: boolean;
  running: boolean;
  runningMethod?: string;
  responsive: boolean;
  uiAutomationAlive?: boolean;
  portForward: boolean;
  stale?: boolean;
  recovering?: boolean;
  recoveryAttempts?: number;
}

interface SetupStore {
  ready: boolean;
  checking: boolean;
  onboarded: boolean;
  agentInstalled: boolean;
  agentRunning: boolean;
  agentResponsive: boolean;
  agentStale: boolean;
  agentRecovering: boolean;
  agentBuildReady: boolean;
  streamConnected: boolean;
  interactionCount: number;
  agentStatus: AgentStatus | null;
  check: () => Promise<void>;
  reconnectStream: () => Promise<void>;
  setOnboarded: (v: boolean) => void;
}

function readOnboarded(): boolean {
  try {
    if (window.localStorage.getItem(ONBOARDED_KEY) === '1') return true;
    // Legacy: a user who had previously clicked Skip/Finish under the old key
    // is already onboarded.
    if (window.localStorage.getItem(LEGACY_SKIP_KEY) === '1') {
      window.localStorage.setItem(ONBOARDED_KEY, '1');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Check if user explicitly requested to see the wizard (bypasses auto-promote)
function shouldForceWizard(): boolean {
  try {
    return sessionStorage.getItem('manualflow.forceWizard') === '1';
  } catch {
    return false;
  }
}

function writeOnboarded(v: boolean) {
  try {
    if (v) window.localStorage.setItem(ONBOARDED_KEY, '1');
    else window.localStorage.removeItem(ONBOARDED_KEY);
  } catch {
    // ignore storage errors
  }
}

export const useSetupStore = create<SetupStore>((set, get) => ({
  ready: false,
  checking: true,
  onboarded: readOnboarded(),
  agentInstalled: false,
  agentRunning: false,
  agentResponsive: false,
  agentStale: false,
  agentRecovering: false,
  agentBuildReady: false,
  streamConnected: false,
  interactionCount: 0,
  agentStatus: null,

  check: async () => {
    set({ checking: true });
    try {
      const [devices, agent, stream] = await Promise.all([
        api.getDevices().catch(() => []),
        api.getAgentStatus().catch(() => ({
          ready: false,
          build: { ready: false, exists: false },
          installed: false,
          running: false,
          responsive: false,
          uiAutomationAlive: false,
          portForward: false,
          stale: false,
          recovering: false,
          recoveryAttempts: 0,
        })),
        api.getStreamStatus().catch(() => ({ connected: false, device: null, interactionCount: 0 })),
      ]);
      const hasDevice = Array.isArray(devices) && devices.length > 0;
      const ready = hasDevice && agent.ready && stream.connected;
      // Auto-promote onboarding once the user has reached a working state at
      // least once. From then on, transient agent dips (Maestro pausing the
      // agent during a run, bridge severance, etc.) won't snap the UI back to
      // the wizard — the inline status badges surface the degraded state.
      // Skip auto-promote if the user explicitly requested to see the wizard.
      const forceWizard = shouldForceWizard();
      if (ready && !get().onboarded && !forceWizard) {
        writeOnboarded(true);
        set({ onboarded: true });
      }
      // Clear the force flag after first check so subsequent checks work normally
      if (forceWizard) {
        try {
          sessionStorage.removeItem('manualflow.forceWizard');
        } catch {}
      }
      set({
        agentBuildReady: agent.build?.ready ?? false,
        agentInstalled: agent.installed,
        agentRunning: agent.running,
        agentResponsive: agent.responsive,
        agentStale: agent.stale ?? false,
        agentRecovering: agent.recovering ?? false,
        streamConnected: stream.connected,
        interactionCount: stream.interactionCount ?? 0,
        agentStatus: agent,
        ready,
        checking: false,
      });
    } catch {
      set({ ready: false, checking: false });
    }
  },

  reconnectStream: async () => {
    await api.reconnectStream().catch(() => {});
  },

  setOnboarded: (v: boolean) => {
    writeOnboarded(v);
    set({ onboarded: v });
  },
}));
