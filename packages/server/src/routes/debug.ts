import { Router } from 'express';
import { spawn } from 'child_process';
import { adbExec, type AppState } from '../index.js';

export function debugRoutes(state: AppState) {
  const router = Router();

  // Stream raw getevent output via SSE
  router.get('/debug/getevent', async (req, res) => {
    const serial = state.activeDevice;
    if (!serial) {
      res.status(400).json({ error: 'No device selected' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Discover touch device first
    let devicePath = '/dev/input/event3'; // default
    try {
      const lp = await adbExec('-s', serial, 'shell', 'getevent', '-lp');
      const match = lp.match(/add device \d+:\s+(\/dev\/input\/event\d+)[\s\S]*?ABS_MT_POSITION_X/);
      if (match) devicePath = match[1];
    } catch {}

    res.write(`data: ${JSON.stringify({ type: 'info', message: `Streaming from ${devicePath}` })}\n\n`);

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

    proc.stderr.on('data', (chunk: Buffer) => {
      res.write(`data: ${JSON.stringify({ type: 'error', message: chunk.toString().trim() })}\n\n`);
    });

    proc.on('close', (code) => {
      res.write(`data: ${JSON.stringify({ type: 'closed', code })}\n\n`);
      res.end();
    });

    req.on('close', () => {
      proc.kill();
    });
  });

  // Get raw ADB shell output
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

  // Get UI hierarchy dump
  router.get('/debug/hierarchy', async (_req, res) => {
    const serial = state.activeDevice;
    if (!serial) return res.status(400).json({ error: 'No device selected' });

    try {
      await adbExec('-s', serial, 'shell', 'uiautomator', 'dump', '/sdcard/window_dump.xml');
      const xml = await adbExec('-s', serial, 'shell', 'cat', '/sdcard/window_dump.xml');
      res.json({ xml });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get logcat from agent
  router.get('/debug/logcat', async (_req, res) => {
    const serial = state.activeDevice;
    if (!serial) return res.status(400).json({ error: 'No device selected' });

    try {
      const output = await adbExec('-s', serial, 'shell', 'logcat', '-d', '-t', '50', '-s', 'MaestroHttpServer:*');
      res.json({ output });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
