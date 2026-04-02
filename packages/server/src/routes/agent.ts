import { Router } from 'express';
import { spawn, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { adbExec, type AppState } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APK_PATH = path.resolve(__dirname, '../../../../agent/build/outputs/apk/androidTest/debug/agent-debug-androidTest.apk');
const AGENT_PKG = 'com.maestrorecorder.agent.test';
const AGENT_PORT = 50051;

export function agentRoutes(state: AppState) {
  const router = Router();

  // Check agent status: installed? running? responsive?
  router.get('/agent/status', async (_req, res) => {
    const serial = state.activeDevice;
    if (!serial) return res.json({ installed: false, running: false, responsive: false, error: 'No device selected' });

    try {
      // Check if installed
      const packages = await adbExec('-s', serial, 'shell', 'pm', 'list', 'packages', AGENT_PKG);
      const installed = packages.includes(AGENT_PKG);

      if (!installed) return res.json({ installed: false, running: false, responsive: false });

      // Check if instrumentation is running (check for the process)
      const ps = await adbExec('-s', serial, 'shell', 'ps', '-A').catch(() => '');
      const running = ps.includes('maestrorecorder') || ps.includes('InstrumentationRunner');

      // Check if HTTP server responds
      let responsive = false;
      if (running) {
        try {
          await adbExec('-s', serial, 'forward', `tcp:${AGENT_PORT}`, `tcp:${AGENT_PORT}`);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2000);
          const resp = await fetch(`http://127.0.0.1:${AGENT_PORT}/device-info`, { signal: controller.signal });
          clearTimeout(timeout);
          responsive = resp.ok;
        } catch {
          responsive = false;
        }
      }

      res.json({ installed, running, responsive });
    } catch (e: any) {
      res.json({ installed: false, running: false, responsive: false, error: e.message });
    }
  });

  // Install agent APK
  router.post('/agent/install', async (_req, res) => {
    const serial = state.activeDevice;
    if (!serial) return res.status(400).json({ error: 'No device selected' });

    if (!fs.existsSync(APK_PATH)) {
      return res.status(404).json({ error: 'Agent APK not found. Build it first: ./gradlew :agent:assembleDebugAndroidTest' });
    }

    try {
      const output = await adbExec('-s', serial, 'install', '-r', '-t', APK_PATH);
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

    // Kill existing if running
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

    // Wait a bit then check if it's responsive
    await new Promise(r => setTimeout(r, 3000));

    try {
      await adbExec('-s', serial, 'forward', `tcp:${AGENT_PORT}`, `tcp:${AGENT_PORT}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const resp = await fetch(`http://127.0.0.1:${AGENT_PORT}/device-info`, { signal: controller.signal });
      clearTimeout(timeout);

      if (resp.ok) {
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
