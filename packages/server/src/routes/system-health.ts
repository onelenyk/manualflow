import { Router } from 'express';
import type { AppState } from '../index.js';
import { adbExec } from '../index.js';
import { checkBuildReady, checkInstalled, checkRunning, checkResponsive, checkUiAutomation, checkPortForward } from './agent.js';
import { runner } from './runner.js';
import { getMaestroProjectConfig } from '../config/maestro-project.js';
import { getOpenRouterStatus } from '../config/ai.js';

const MAESTRO_DAEMON_PKG = 'dev.mobile.maestro';

/**
 * Unified system health endpoint aggregating all subsystems
 */
export function systemHealthRoutes(state: AppState): Router {
  const router = Router();

  router.get('/system/health', async (_req, res) => {
    const serial = state.activeDevice;

    // Agent section
    let agent: any = {
      installed: false,
      running: false,
      responsive: false,
      uiAutomationAlive: false,
      portForward: false,
      recovering: false,
      recoveryAttempts: 0,
      build: { ready: false, exists: false },
      eventDiversity: { ok: true, recentTypes: [], warning: null }
    };

    if (serial) {
      const [build, installed, running, responsive, uiAutomationAlive, portForward] = await Promise.all([
        checkBuildReady(),
        checkInstalled(serial),
        checkRunning(serial),
        checkResponsive(serial),
        checkUiAutomation(serial),
        checkPortForward(serial),
      ]);

      agent = {
        installed,
        running: running.running,
        responsive,
        uiAutomationAlive,
        portForward,
        recovering: false, // TODO: wire from recovery monitor state if available
        recoveryAttempts: 0,
        build,
        eventDiversity: state.deviceStream?.getEventDiversity() ?? { ok: true, recentTypes: [], warning: null }
      };
    }

    // Infra section
    const infra: any = {
      device: { serial: serial ?? null, connected: !!serial },
      adb: false,
      mirror: { active: false }
    };

    if (serial) {
      try {
        await adbExec('devices', '-l');
        infra.adb = true;
      } catch {}
      infra.mirror.active = !!state.scrcpyProcess;
    }

    // Maestro section (daemon detection + test runner)
    const maestro: any = {
      daemonRunning: false,
      testRunnerActive: false,
      conflictDetected: false
    };

    if (serial) {
      // Check for dev.mobile.maestro daemon (UiAutomation conflict source)
      try {
        // Try pidof first (Android 8+)
        let pidof = '';
        try {
          pidof = await adbExec('-s', serial, 'shell', 'pidof', MAESTRO_DAEMON_PKG);
        } catch {
          pidof = '';
        }
        if (pidof.trim()) {
          maestro.daemonRunning = true;
        } else {
          // Fallback: ps | grep for older Android
          const ps = await adbExec('-s', serial, 'shell', 'ps', '-A');
          maestro.daemonRunning = ps.includes(MAESTRO_DAEMON_PKG);
        }
      } catch {
        // Ignore errors — treat as not running
      }

      maestro.testRunnerActive = runner.hasActiveRuns();
      maestro.conflictDetected = maestro.daemonRunning && agent.running;
    }

    // Env section
    const env: any = {
      port: parseInt(process.env.PORT || '2344', 10),
      agentPort: parseInt(process.env.AGENT_PORT || '50051', 10),
      openRouterConfigured: false,
      openRouterSource: null as 'stored' | 'env' | null,
      projectPath: null as string | null
    };

    const openRouterStatus = getOpenRouterStatus();
    env.openRouterConfigured = openRouterStatus.configured;
    env.openRouterSource = openRouterStatus.source;

    const projectConfig = getMaestroProjectConfig();
    env.projectPath = projectConfig.current;

    res.json({ agent, infra, maestro, env });
  });

  // POST: Stop maestro daemon (remediation action for UiAutomation conflict)
  router.post('/system/stop-maestro-daemon', async (_req, res) => {
    const serial = state.activeDevice;
    if (!serial) {
      return res.status(400).json({ error: 'No device selected' });
    }

    try {
      await adbExec('-s', serial, 'shell', 'am', 'force-stop', MAESTRO_DAEMON_PKG);
      res.json({ status: 'stopped' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
