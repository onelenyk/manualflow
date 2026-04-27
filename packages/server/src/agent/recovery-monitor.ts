/**
 * Auto-recovery monitor for the on-device agent's UiAutomation bridge.
 *
 * The agent process can stay alive while its UiAutomation handle silently dies
 * (e.g. after the target app restarts or Maestro hands off). The monitor polls
 * a healthCheck on its own setInterval and, after two consecutive stale ticks,
 * restarts the agent — guarded against Maestro runs, rate-limited, and capped.
 *
 * Encapsulated as a factory so unit tests can inject mocks and a fake clock.
 */

export interface RecoveryMonitorDeps {
  /** Probe UiAutomation liveness — true when the bridge is alive. */
  healthCheck: () => Promise<boolean>;
  /** Stop the agent (force-stop on device + kill local process). */
  stopAgent: () => Promise<void>;
  /** Start the agent (spawn instrumentation, wait for boot). */
  startAgent: () => Promise<unknown>;
  /** Return true while a Maestro run is active — recovery is paused. */
  maestroGuard: () => boolean;
  /** Injectable for tests; defaults to Date.now. */
  clock?: () => number;
}

export interface RecoveryMonitorState {
  staleCount: number;
  consecutiveRecoveries: number;
  lastRecoveryAt: number;
  recoveryInProgress: boolean;
}

export interface RecoveryMonitor {
  /** Single iteration. Called by setInterval in production, directly in tests. */
  tick(): Promise<void>;
  getState(): RecoveryMonitorState;
}

/** Recovery debounce — require N consecutive stale ticks before firing. */
const STALE_THRESHOLD = 2;
/** Wall-clock cooldown between recovery attempts. */
export const RECOVERY_COOLDOWN_MS = 30_000;
/** Give up after N consecutive failed recoveries — manual intervention needed. */
export const MAX_CONSECUTIVE_RECOVERIES = 3;

export function createRecoveryMonitor(deps: RecoveryMonitorDeps): RecoveryMonitor {
  const clock = deps.clock ?? Date.now;
  const state: RecoveryMonitorState = {
    staleCount: 0,
    consecutiveRecoveries: 0,
    lastRecoveryAt: 0,
    recoveryInProgress: false,
  };

  async function tick(): Promise<void> {
    if (state.recoveryInProgress) return;

    let alive = false;
    try {
      alive = await deps.healthCheck();
    } catch {
      alive = false;
    }

    if (alive) {
      state.staleCount = 0;
      state.consecutiveRecoveries = 0;
      return;
    }

    state.staleCount++;
    if (state.staleCount < STALE_THRESHOLD) return;
    if (deps.maestroGuard()) return;
    if (clock() - state.lastRecoveryAt < RECOVERY_COOLDOWN_MS) return;
    if (state.consecutiveRecoveries >= MAX_CONSECUTIVE_RECOVERIES) return;

    state.recoveryInProgress = true;
    state.lastRecoveryAt = clock();
    state.consecutiveRecoveries++;
    state.staleCount = 0;

    // Fire-and-forget so the interval can keep firing. The reentrancy guard
    // above blocks new ticks until recoveryInProgress clears in .finally().
    Promise.resolve()
      .then(() => deps.stopAgent())
      .then(() => deps.startAgent())
      .catch(() => {})
      .finally(() => { state.recoveryInProgress = false; });
  }

  return {
    tick,
    getState: () => ({ ...state }),
  };
}
