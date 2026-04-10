import { spawn } from 'child_process';
import { adbExec, type AppState } from '../index.js';

export const AGENT_PKG = 'com.maestrorecorder.agent.test';
export const AGENT_PKG_MAIN = 'com.maestrorecorder.agent';
export const AGENT_PORT = 50051;

export interface AgentStartResult {
  started: boolean;
  responsive: boolean;
  warning?: string;
}

/**
 * Stop the ManualFlow agent instrumentation on a device.
 * Force-stops the app on device, kills the local spawn handle and
 * disconnects the device stream so Android can release UiAutomation.
 *
 * This is required before running Maestro, because only one
 * instrumentation can own UiAutomation at a time.
 */
export async function stopAgent(state: AppState, serial: string): Promise<void> {
  if (state.agentProcess) {
    state.agentProcess.kill();
    state.agentProcess = null;
  }
  if (state.deviceStream?.connected) {
    state.deviceStream.disconnect();
  }
  try {
    await adbExec('-s', serial, 'shell', 'am', 'force-stop', AGENT_PKG_MAIN);
    await adbExec('-s', serial, 'shell', 'am', 'force-stop', AGENT_PKG);
    await adbExec('-s', serial, 'forward', '--remove', `tcp:${AGENT_PORT}`).catch(() => {});
  } catch {}
}

/**
 * Start the ManualFlow agent instrumentation on a device and wait
 * for it to respond, then auto-reconnect the device stream.
 */
export async function startAgent(state: AppState, serial: string): Promise<AgentStartResult> {
  if (state.agentProcess) {
    state.agentProcess.kill();
    state.agentProcess = null;
  }

  const proc = spawn('adb', [
    '-s', serial, 'shell', 'am', 'instrument', '-w',
    '-e', 'class', 'com.maestrorecorder.agent.RecorderInstrumentation#startServer',
    `${AGENT_PKG}/androidx.test.runner.AndroidJUnitRunner`,
  ], { stdio: 'ignore' });

  proc.on('close', () => {
    if (state.agentProcess === proc) state.agentProcess = null;
  });

  state.agentProcess = proc;

  // Wait for boot, then probe
  await new Promise(r => setTimeout(r, 3000));

  try {
    await adbExec('-s', serial, 'forward', `tcp:${AGENT_PORT}`, `tcp:${AGENT_PORT}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(`http://127.0.0.1:${AGENT_PORT}/device-info`, { signal: controller.signal });
    clearTimeout(timeout);

    if (resp.ok) {
      if (state.deviceStream && !state.deviceStream.connected) {
        state.deviceStream.connect(serial).catch(() => {});
      }
      return { started: true, responsive: true };
    }
    return { started: true, responsive: false, warning: 'Agent started but not responding yet' };
  } catch {
    return { started: true, responsive: false, warning: 'Agent started but not responding yet' };
  }
}
