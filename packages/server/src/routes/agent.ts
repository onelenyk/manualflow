import { Router } from 'express';
import { spawn, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { adbExec, type AppState } from '../index.js';
import { adbExecutable } from '../util/adb.js';
import type { RecoveryMonitorState } from '../agent/recovery-monitor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APK_PATH = path.resolve(__dirname, '../../../../agent/build/outputs/apk/androidTest/debug/agent-debug-androidTest.apk');
const AGENT_PKG = 'com.maestrorecorder.agent.test';
const AGENT_PORT = 50051;

// Track local agent process PIDs for reliable running detection
const localAgentPids = new Set<number>();

/**
 * Check if agent APK is built and exists on disk
 */
export async function checkBuildReady(): Promise<{ ready: boolean; exists: boolean; versionCode?: string; buildTime?: string }> {
  const exists = fs.existsSync(APK_PATH);
  if (!exists) return { ready: false, exists: false };

  const stats = fs.statSync(APK_PATH);
  const buildTime = stats.mtime.toISOString();
  return { ready: true, exists: true, buildTime };
}

/**
 * Check if agent is installed on device
 */
export async function checkInstalled(serial: string): Promise<boolean> {
  try {
    const packages = await adbExec('-s', serial, 'shell', 'pm', 'list', 'packages', AGENT_PKG);
    return packages.includes(AGENT_PKG);
  } catch {
    return false;
  }
}

/**
 * Check if agent instrumentation is running - multiple detection methods
 */
export async function checkRunning(serial: string): Promise<{ running: boolean; method: string }> {
  // Method 1: Check tracked local process
  if (localAgentPids.size > 0) {
    return { running: true, method: 'local' };
  }

  // Method 2: Check device process list
  try {
    const ps = await adbExec('-s', serial, 'shell', 'ps', '-A');
    if (ps.includes('maestrorecorder') || ps.includes('InstrumentationRunner')) {
      return { running: true, method: 'ps' };
    }
  } catch {}

  // Method 3: Check via am stack list
  try {
    const am = await adbExec('-s', serial, 'shell', 'am', 'stack', 'list');
    if (am.includes(AGENT_PKG)) {
      return { running: true, method: 'am' };
    }
  } catch {}

  return { running: false, method: 'none' };
}

/**
 * Check if agent HTTP server responds
 */
export async function checkResponsive(serial: string): Promise<boolean> {
  try {
    await adbExec('-s', serial, 'forward', `tcp:${AGENT_PORT}`, `tcp:${AGENT_PORT}`);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(`http://127.0.0.1:${AGENT_PORT}/device-info`, { signal: controller.signal });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Probe UiAutomation liveness via the agent's /health endpoint.
 * Returns true only when rootInActiveWindow is non-null on the device.
 * The bridge can be severed (target app restart, Maestro hand-off) while
 * the HTTP server still responds — checkResponsive can't tell, but this can.
 */
export async function checkUiAutomation(serial: string): Promise<boolean> {
  try {
    await adbExec('-s', serial, 'forward', `tcp:${AGENT_PORT}`, `tcp:${AGENT_PORT}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(`http://127.0.0.1:${AGENT_PORT}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return false;
    const body = await resp.json() as { uiAutomationAlive?: boolean };
    return body.uiAutomationAlive === true;
  } catch {
    return false;
  }
}

/**
 * Check if port forwarding is set up
 */
export async function checkPortForward(serial: string): Promise<boolean> {
  try {
    const forwards = await adbExec('-s', serial, 'forward', '--list');
    return forwards.includes(`tcp:${AGENT_PORT}`);
  } catch {
    return false;
  }
}

export function agentRoutes(
  state: AppState,
  getRecoveryState?: () => RecoveryMonitorState,
) {
  const router = Router();

  // Comprehensive agent status
  router.get('/agent/status', async (_req, res) => {
    const serial = state.activeDevice;
    if (!serial) {
      return res.json({
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
        error: 'No device selected'
      });
    }

    const [build, installed, running, responsive, uiAutomationAlive, portForward] = await Promise.all([
      checkBuildReady(),
      checkInstalled(serial),
      checkRunning(serial),
      checkResponsive(serial),
      checkUiAutomation(serial),
      checkPortForward(serial),
    ]);

    const recovery = getRecoveryState?.();
    res.json({
      ready: build.ready && installed && running.running && responsive && uiAutomationAlive,
      build,
      installed,
      running: running.running,
      runningMethod: running.method,
      responsive,
      uiAutomationAlive,
      portForward,
      stale: responsive && !uiAutomationAlive,
      recovering: recovery?.recoveryInProgress ?? false,
      recoveryAttempts: recovery?.consecutiveRecoveries ?? 0,
    });
  });

  // Build status only
  router.get('/agent/build-status', async (_req, res) => {
    res.json(await checkBuildReady());
  });

  // Install agent APK
  router.post('/agent/install', async (_req, res) => {
    const serial = state.activeDevice;
    if (!serial) return res.status(400).json({ error: 'No device selected' });

    if (!fs.existsSync(APK_PATH)) {
      return res.status(404).json({ error: 'Agent APK not found. Build it first: ./gradlew :agent:assembleDebugAndroidTest' });
    }

    try {
      // Disable sideload verification (prevents "Unsafe app blocked" dialog)
      await adbExec('-s', serial, 'shell', 'settings', 'put', 'global', 'verifier_verify_adb_installs', '0').catch(() => {});
      await adbExec('-s', serial, 'shell', 'settings', 'put', 'global', 'package_verifier_enable', '0').catch(() => {});

      // Try with --bypass-low-target-sdk-block first (Android 14+), fall back without it
      let output: string;
      try {
        output = await adbExec('-s', serial, 'install', '-r', '-t', '-g', '--bypass-low-target-sdk-block', APK_PATH);
      } catch {
        output = await adbExec('-s', serial, 'install', '-r', '-t', '-g', APK_PATH);
      }

      // Mark as trusted installer to prevent future warnings
      await adbExec('-s', serial, 'shell', 'pm', 'set-installer', AGENT_PKG, 'com.android.vending').catch(() => {});

      res.json({ status: 'installed', output });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Uninstall agent
  router.post('/agent/uninstall', async (_req, res) => {
    const serial = state.activeDevice;
    if (!serial) return res.status(400).json({ error: 'No device selected' });

    try {
      await adbExec('-s', serial, 'uninstall', AGENT_PKG);
      res.json({ status: 'uninstalled' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Start agent (instrumentation)
  router.post('/agent/start', async (_req, res) => {
    const serial = state.activeDevice;
    if (!serial) return res.status(400).json({ error: 'No device selected' });

    // Clear existing PIDs
    localAgentPids.clear();

    // Kill existing if running
    if (state.agentProcess) {
      state.agentProcess.kill();
      state.agentProcess = null;
    }

    const proc = spawn(adbExecutable(), [
      '-s', serial, 'shell', 'am', 'instrument', '-w',
      '-e', 'class', 'com.maestrorecorder.agent.RecorderInstrumentation#startServer',
      `${AGENT_PKG}/androidx.test.runner.AndroidJUnitRunner`,
    ], { stdio: 'ignore' });

    // Track PID for reliable running detection
    localAgentPids.add(proc.pid!);

    proc.on('close', () => {
      localAgentPids.delete(proc.pid!);
      if (state.agentProcess === proc) state.agentProcess = null;
    });

    state.agentProcess = proc;

    // Wait a bit then check if it's responsive
    await new Promise(r => setTimeout(r, 3000));

    try {
      await adbExec('-s', serial, 'forward', `tcp:${AGENT_PORT}`, `tcp:${AGENT_PORT}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const resp = await fetch(`http://127.0.0.1:${AGENT_PORT}/device-info`, { signal: controller.signal });
      clearTimeout(timeout);

      if (resp.ok) {
        // Agent is responsive — auto-connect device stream
        if (state.deviceStream && serial && !state.deviceStream.connected) {
          state.deviceStream.connect(serial).catch(() => {});
        }
        res.json({ status: 'started', responsive: true });
      } else {
        res.json({ status: 'started', responsive: false, warning: 'Agent started but not responding yet' });
      }
    } catch {
      res.json({ status: 'started', responsive: false, warning: 'Agent started but not responding yet. Try again in a few seconds.' });
    }
  });

  // Stop agent
  router.post('/agent/stop', async (_req, res) => {
    const serial = state.activeDevice;
    if (!serial) return res.status(400).json({ error: 'No device selected' });

    // Clear PID tracking
    localAgentPids.clear();

    if (state.agentProcess) {
      state.agentProcess.kill();
      state.agentProcess = null;
    }

    // Also force-stop on device
    try {
      await adbExec('-s', serial, 'shell', 'am', 'force-stop', 'com.maestrorecorder.agent');
      await adbExec('-s', serial, 'forward', '--remove', `tcp:${AGENT_PORT}`).catch(() => {});
    } catch {}

    res.json({ status: 'stopped' });
  });

  // Build agent APK
  router.post('/agent/build', (_req, res) => {
    const proc = spawn('./gradlew', [':agent:assembleDebugAndroidTest'], {
      cwd: path.resolve(__dirname, '../../../..'),
      stdio: 'pipe',
    });

    let output = '';
    proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { output += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        res.json({ status: 'built', apkPath: APK_PATH });
      } else {
        res.status(500).json({ error: 'Build failed', output: output.slice(-500) });
      }
    });
  });

  return router;
}
