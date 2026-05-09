import type { Server } from 'http';
import type { AppState } from './index.js';
import { stopAgent } from './agent/agent-lifecycle.js';
import { runner } from './routes/runner.js';

export interface ShutdownDeps {
  state: AppState;
  recoveryInterval: NodeJS.Timeout;
  httpServer: Server;
}

/**
 * Best-effort, time-budgeted graceful shutdown.
 *
 * Order matches plan §7: stop recurring work first, then user-visible runs,
 * then device-side processes, then network/server. Each step has its own
 * timeout so a single hung resource cannot block the others.
 *
 * Idempotent: a second call is a no-op.
 */
let shuttingDown = false;

export async function gracefulShutdown(deps: ShutdownDeps, reason: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[lifecycle] shutdown begin reason=${reason}`);

  const { state, recoveryInterval, httpServer } = deps;

  // 1. recovery monitor
  clearInterval(recoveryInterval);

  // 2. stop active Maestro runs (best effort)
  await withTimeout(1500, async () => {
    for (const r of runner.listRuns()) {
      if (r.status === 'running' || r.status === 'paused') {
        runner.stop(r.id);
      }
    }
  }, 'stop-runs');

  // 3. stop agent on active device
  await withTimeout(500, async () => {
    const serial = state.activeDevice;
    if (serial) await stopAgent(state, serial);
  }, 'stop-agent');

  // 4. disconnect device stream
  await withTimeout(1000, async () => {
    state.deviceStream?.disconnect();
  }, 'device-stream');

  // 5. kill scrcpy
  await withTimeout(500, async () => {
    state.scrcpyProcess?.kill();
  }, 'scrcpy');

  // 6. kill agent process (usually null after stopAgent)
  await withTimeout(300, async () => {
    state.agentProcess?.kill();
  }, 'agent-process');

  // 7. close HTTP server
  await withTimeout(500, () =>
    new Promise<void>((resolve) => httpServer.close(() => resolve()))
  , 'http-close');

  console.log('[lifecycle] shutdown done');
}

async function withTimeout(ms: number, fn: () => unknown, label: string): Promise<void> {
  const start = Date.now();
  try {
    await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout ${label}`)), ms)),
    ]);
    console.log(`[lifecycle] step=${label} ok dur_ms=${Date.now() - start}`);
  } catch (e) {
    console.warn(`[lifecycle] step=${label} fail dur_ms=${Date.now() - start} err=${(e as Error).message}`);
  }
}
