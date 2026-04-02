import { Router } from 'express';
import { spawn } from 'child_process';
import http from 'http';
import { adbExec, type AppState } from '../index.js';

const AGENT_PORT = 50051;

export function debugRoutes(state: AppState) {
  const router = Router();

  // Stream accessibility events from agent via SSE
  router.get('/debug/events', async (req, res) => {
    const serial = state.activeDevice;
    if (!serial) {
      res.status(400).json({ error: 'No device selected' });
      return;
    }

    // Ensure port forwarding
    await adbExec('-s', serial, 'forward', `tcp:${AGENT_PORT}`, `tcp:${AGENT_PORT}`).catch(() => {});

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    res.write(`data: ${JSON.stringify({ type: 'info', message: 'Connecting to agent event stream...' })}\n\n`);

    // Connect to agent's chunked /events/stream endpoint
    const agentReq = http.get(`http://127.0.0.1:${AGENT_PORT}/events/stream`, (agentRes) => {
      res.write(`data: ${JSON.stringify({ type: 'info', message: 'Connected to agent. Touch the device to see events.' })}\n\n`);

      let buffer = '';
      agentRes.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (line.trim()) {
            try {
              const event = JSON.parse(line);
              res.write(`data: ${JSON.stringify({ type: 'event', event })}\n\n`);
            } catch {
              res.write(`data: ${JSON.stringify({ type: 'raw', line: line.trim() })}\n\n`);
            }
          }
        }
      });

      agentRes.on('end', () => {
        res.write(`data: ${JSON.stringify({ type: 'info', message: 'Agent stream ended' })}\n\n`);
        res.end();
      });

      agentRes.on('error', (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
        res.end();
      });
    });

    agentReq.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ type: 'error', message: `Cannot connect to agent: ${err.message}` })}\n\n`);
      res.end();
    });

    req.on('close', () => {
      agentReq.destroy();
    });
  });

  // Poll events (non-streaming fallback)
  router.get('/debug/events/poll', async (_req, res) => {
    const serial = state.activeDevice;
    if (!serial) return res.status(400).json({ error: 'No device selected' });

    try {
      await adbExec('-s', serial, 'forward', `tcp:${AGENT_PORT}`, `tcp:${AGENT_PORT}`).catch(() => {});
      const resp = await fetch(`http://127.0.0.1:${AGENT_PORT}/events`);
      const events = await resp.json();
      res.json(events);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Raw getevent stream (kernel-level, for physical touch debugging)
  router.get('/debug/getevent', async (req, res) => {
    const serial = state.activeDevice;
    if (!serial) return res.status(400).json({ error: 'No device selected' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    let devicePath = '/dev/input/event3';
    try {
      const { discoverInputDevice } = await import('../recording/getevent-parser.js');
      const device = await discoverInputDevice(serial);
      devicePath = device.devicePath;
    } catch {}

    res.write(`data: ${JSON.stringify({ type: 'info', message: `Streaming kernel events from ${devicePath}` })}\n\n`);

    const proc = spawn('adb', ['-s', serial, 'shell', 'getevent', '-lt', devicePath]);
    let buffer = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop()!;
      for (const line of lines) {
        if (line.trim()) {
          res.write(`data: ${JSON.stringify({ type: 'event', line: line.trim() })}\n\n`);
        }
      }
    });

    proc.on('close', (code) => {
      res.write(`data: ${JSON.stringify({ type: 'closed', code })}\n\n`);
      res.end();
    });

    req.on('close', () => proc.kill());
  });

  // ADB shell command
  router.post('/debug/adb', async (req, res) => {
    const serial = state.activeDevice;
    if (!serial) return res.status(400).json({ error: 'No device selected' });

    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'No command provided' });

    try {
      const args = command.split(' ').filter((s: string) => s);
      const output = await adbExec('-s', serial, 'shell', ...args);
      res.json({ output });
    } catch (e: any) {
      res.json({ output: e.message });
    }
  });

  // UI hierarchy dump
  router.get('/debug/hierarchy', async (_req, res) => {
    const serial = state.activeDevice;
    if (!serial) return res.status(400).json({ error: 'No device selected' });

    try {
      const result = await adbExec('-s', serial, 'exec-out', 'uiautomator', 'dump', '/dev/tty').catch(() => '');
      if (result && result.includes('<')) {
        res.json({ xml: result });
      } else {
        await adbExec('-s', serial, 'shell', 'uiautomator', 'dump', '/data/local/tmp/ui.xml').catch(() => {});
        const xml = await adbExec('-s', serial, 'shell', 'cat', '/data/local/tmp/ui.xml').catch(() => 'Dump failed');
        res.json({ xml });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Agent logcat
  router.get('/debug/logcat', async (_req, res) => {
    const serial = state.activeDevice;
    if (!serial) return res.status(400).json({ error: 'No device selected' });

    try {
      const output = await adbExec('-s', serial, 'shell', 'logcat', '-d', '-t', '50');
      res.json({ output });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
