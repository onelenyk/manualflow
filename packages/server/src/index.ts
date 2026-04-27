import express from 'express';
import cors from 'cors';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { deviceRoutes } from './routes/devices.js';
import { streamingRoutes } from './routes/streaming.js';
import { agentRoutes, checkUiAutomation } from './routes/agent.js';
import { debugRoutes } from './routes/debug.js';
import { yamlRoutes } from './routes/yaml.js';
import { templatesRoutes } from './routes/templates.js';
import { flowRoutes } from './routes/flows.js';
import { runnerRoutes, runner } from './routes/runner.js';
import { aiRoutes } from './routes/ai.js';
import { aiFlowRoutes } from './routes/ai-flow.js';
import { maestroRoutes } from './routes/maestro.js';
import { systemRoutes } from './routes/system.js';
import { systemHealthRoutes } from './routes/system-health.js';
import { getMaestroProjectConfig, saveMaestroProjectConfig } from './config/maestro-project.js';
import fs from 'fs';
import { DeviceStream } from './streaming/device-stream.js';
import { startAgent, stopAgent } from './agent/agent-lifecycle.js';
import { createRecoveryMonitor } from './agent/recovery-monitor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '2344', 10);

const app = express();
app.use(cors());
app.use(express.json());

export function adbExec(...args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('adb', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`adb ${args.join(' ')} failed: ${stderr || err.message}`));
      else resolve(stdout.trim());
    });
  });
}

export interface AppState {
  activeDevice: string | null;
  scrcpyProcess: import('child_process').ChildProcess | null;
  deviceStream: DeviceStream | null;
  agentProcess: import('child_process').ChildProcess | null;
}

const state: AppState = { activeDevice: null, scrcpyProcess: null, deviceStream: new DeviceStream(), agentProcess: null };

const recoveryMonitor = createRecoveryMonitor({
  healthCheck: async () => {
    const serial = state.activeDevice;
    if (!serial) return true;
    return checkUiAutomation(serial);
  },
  stopAgent: async () => {
    const serial = state.activeDevice;
    if (!serial) return;
    await stopAgent(state, serial);
  },
  startAgent: async () => {
    const serial = state.activeDevice;
    if (!serial) return;
    await startAgent(state, serial);
  },
  maestroGuard: () => runner.hasActiveRuns(),
});

app.get('/health', (_req, res) => res.send('OK'));
app.use('/api', deviceRoutes(state));
app.use('/api', streamingRoutes(state));
app.use('/api', agentRoutes(state, () => recoveryMonitor.getState()));
app.use('/api', debugRoutes(state));
app.use('/api', yamlRoutes());
app.use('/api', templatesRoutes());
app.use('/api', flowRoutes());
app.use('/api', runnerRoutes(state));
app.use('/api', aiRoutes());
app.use('/api', aiFlowRoutes());
app.use('/api', maestroRoutes(state));
app.use('/api', systemRoutes());
app.use('/api', systemHealthRoutes(state));

// Server-startup GC: drop missing recents and clear current if its folder is gone.
try {
  const cfg = getMaestroProjectConfig();
  const recents = cfg.recents.filter(p => fs.existsSync(p));
  const current = cfg.current && fs.existsSync(cfg.current) ? cfg.current : null;
  if (recents.length !== cfg.recents.length || current !== cfg.current) {
    saveMaestroProjectConfig({ current, recents });
  }
} catch {}

const frontendDist = process.env.MANUALFLOW_STATIC_DIR
  ? path.resolve(process.env.MANUALFLOW_STATIC_DIR)
  : path.resolve(__dirname, '../../../dashboard/src/main/resources/static');
app.use(express.static(frontendDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Bind to loopback by default so the dashboard is only reachable from
// localhost. The trust model assumes a single-user dev machine; set
// HOST=0.0.0.0 explicitly if you know you want LAN exposure.
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`MaestroRecorder dashboard: http://${HOST}:${PORT}`);
});

const RECOVERY_TICK_MS = 3000;
const recoveryInterval = setInterval(() => {
  if (state.activeDevice) recoveryMonitor.tick().catch(() => {});
}, RECOVERY_TICK_MS);

process.on('SIGINT', () => {
  clearInterval(recoveryInterval);
  state.scrcpyProcess?.kill();
  state.agentProcess?.kill();
  state.deviceStream?.disconnect();
  process.exit(0);
});
