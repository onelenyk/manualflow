import { Router } from 'express';
import { execFile } from 'child_process';
import path from 'path';
import os from 'os';
import type { AppState } from '../index.js';
import { adbExec } from '../index.js';
import { FlowStorage } from '../storage/flow-storage.js';
import { TestRunner } from '../runner/test-runner.js';

const storage = new FlowStorage();
const runner = new TestRunner();
const MAESTRO_BIN = path.join(os.homedir(), '.maestro', 'bin', 'maestro');

export function runnerRoutes(state: AppState) {
  const router = Router();

  // Maestro status: installed? version? available devices?
  router.get('/maestro/status', async (_req, res) => {
    let installed = false;
    let version = '';
    try {
      const result = await new Promise<string>((resolve, reject) => {
        execFile(MAESTRO_BIN, ['--version'], { timeout: 5000 }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout.trim());
        });
      });
      installed = true;
      version = result;
    } catch {}

    // Get connected devices via adb
    let devices: { serial: string; model: string }[] = [];
    try {
      const output = await adbExec('devices', '-l');
      devices = output.split('\n').slice(1)
        .filter(l => l.includes('device'))
        .map(l => {
          const parts = l.trim().split(/\s+/);
          const model = parts.find(p => p.startsWith('model:'))?.split(':')[1] || 'unknown';
          return { serial: parts[0], model };
        });
    } catch {}

    res.json({
      installed,
      version,
      binPath: MAESTRO_BIN,
      devices,
      activeDevice: state.activeDevice,
    });
  });

  // Start a test run
  router.post('/runs', (req, res) => {
    const { flowId, deviceSerial } = req.body;
    if (!flowId) return res.status(400).json({ error: 'flowId required' });

    const flow = storage.get(flowId);
    if (!flow) return res.status(404).json({ error: 'Flow not found' });

    const yamlPath = storage.getYamlPath(flowId);
    if (!yamlPath) return res.status(404).json({ error: 'YAML file not found' });

    const serial = deviceSerial || state.activeDevice || undefined;
    const run = runner.start(flowId, flow.meta.name, yamlPath, serial);
    res.json(run);
  });

  // List runs
  router.get('/runs', (_req, res) => {
    res.json(runner.listRuns());
  });

  // Get run status
  router.get('/runs/:runId', (req, res) => {
    const run = runner.getStatus(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json(run);
  });

  // Stop a run
  router.delete('/runs/:runId', (req, res) => {
    const ok = runner.stop(req.params.runId);
    if (!ok) return res.status(404).json({ error: 'Run not found or already finished' });
    res.json({ ok: true });
  });

  // Pause a run (POSIX SIGSTOP)
  router.post('/runs/:runId/pause', (req, res) => {
    const ok = runner.pause(req.params.runId);
    if (!ok) return res.status(409).json({ error: 'Run cannot be paused (not running or already paused)' });
    res.json(runner.getStatus(req.params.runId));
  });

  // Resume a paused run (POSIX SIGCONT)
  router.post('/runs/:runId/resume', (req, res) => {
    const ok = runner.resume(req.params.runId);
    if (!ok) return res.status(409).json({ error: 'Run is not paused' });
    res.json(runner.getStatus(req.params.runId));
  });

  // SSE stream for live run output
  router.get('/runs/:runId/stream', (req, res) => {
    const runId = req.params.runId;
    const run = runner.getStatus(runId);
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Catch up: send existing lines
    for (const line of run.lines) {
      res.write(`data: ${JSON.stringify({ type: 'line', line })}\n\n`);
    }
    // Send current steps
    res.write(`data: ${JSON.stringify({ type: 'steps', steps: run.steps })}\n\n`);

    // If already done (not running or paused), send final status and close
    if (run.status !== 'running' && run.status !== 'paused') {
      res.write(`data: ${JSON.stringify({ type: 'done', run })}\n\n`);
      res.end();
      return;
    }

    // Live updates
    const onLine = (line: string) => {
      res.write(`data: ${JSON.stringify({ type: 'line', line })}\n\n`);
    };
    const onStep = (steps: any[]) => {
      res.write(`data: ${JSON.stringify({ type: 'steps', steps })}\n\n`);
    };
    const onDone = (finalRun: any) => {
      res.write(`data: ${JSON.stringify({ type: 'done', run: finalRun })}\n\n`);
      res.end();
    };

    runner.on(`line:${runId}`, onLine);
    runner.on(`step:${runId}`, onStep);
    runner.on(`done:${runId}`, onDone);

    req.on('close', () => {
      runner.off(`line:${runId}`, onLine);
      runner.off(`step:${runId}`, onStep);
      runner.off(`done:${runId}`, onDone);
    });
  });

  return router;
}
