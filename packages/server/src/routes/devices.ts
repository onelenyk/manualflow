import { Router } from 'express';
import { spawn, execFile } from 'child_process';
import { adbExec, type AppState } from '../index.js';

export function deviceRoutes(state: AppState) {
  const router = Router();

  // --- Device listing ---

  router.get('/devices', async (_req, res) => {
    try {
      const output = await adbExec('devices', '-l');
      const devices = output.split('\n').slice(1)
        .filter((l: string) => l.includes('device'))
        .map((l: string) => {
          const parts = l.trim().split(/\s+/);
          const model = parts.find((p: string) => p.startsWith('model:'))?.split(':')[1] || 'unknown';
          return { serial: parts[0], model, status: 'device' };
        });
      res.json(devices);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/devices/:serial/info', async (req, res) => {
    try {
      const s = req.params.serial;
      const size = await adbExec('-s', s, 'shell', 'wm', 'size');
      const m = size.match(/(\d+)x(\d+)/);
      const density = await adbExec('-s', s, 'shell', 'wm', 'density');
      const d = density.match(/(\d+)/);
      res.json({
        screenWidth: m ? parseInt(m[1]) : 1080,
        screenHeight: m ? parseInt(m[2]) : 1920,
        density: d ? parseInt(d[1]) : 160,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/devices/:serial/select', async (req, res) => {
    const serial = req.params.serial;
    state.activeDevice = serial;

    // Try to auto-connect device stream (non-blocking — agent may not be ready yet)
    if (state.deviceStream) {
      state.deviceStream.connect(serial).catch(() => {
        // Agent not ready yet — will connect when agent starts
      });
    }

    res.json({ selected: serial });
  });

  // --- scrcpy mirror management ---

  router.post('/devices/:serial/mirror', (req, res) => {
    const serial = req.params.serial;

    // Kill existing scrcpy if running
    if (state.scrcpyProcess) {
      state.scrcpyProcess.kill();
      state.scrcpyProcess = null;
    }

    const proc = spawn('scrcpy', [
      '-s', serial,
      '--max-size=800',
      '--window-title=MaestroRecorder',
      '--show-touches',
      '--always-on-top',
    ], { stdio: 'inherit' });

    proc.on('close', () => {
      if (state.scrcpyProcess === proc) {
        state.scrcpyProcess = null;
      }
    });

    proc.on('error', (err) => {
      console.error('scrcpy error:', err.message);
      state.scrcpyProcess = null;
    });

    state.scrcpyProcess = proc;
    res.json({ status: 'launched', pid: proc.pid });
  });

  router.post('/devices/:serial/mirror/stop', (_req, res) => {
    if (state.scrcpyProcess) {
      state.scrcpyProcess.kill();
      state.scrcpyProcess = null;
      res.json({ status: 'stopped' });
    } else {
      res.json({ status: 'not_running' });
    }
  });

  router.get('/devices/:serial/mirror/status', (_req, res) => {
    res.json({ running: state.scrcpyProcess !== null });
  });

  // --- Screenshot ---

  router.get('/devices/:serial/screenshot', (req, res) => {
    const serial = req.params.serial;
    const proc = execFile('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], {
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'buffer' as any,
    }, (err, stdout) => {
      if (err || !stdout || (stdout as any).length === 0) {
        res.status(500).json({ error: 'Screenshot failed' });
        return;
      }
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-cache');
      res.send(stdout);
    });
  });

  // --- Touch input ---

  router.post('/devices/:serial/tap', async (req, res) => {
    const { x, y } = req.body;
    try {
      await adbExec('-s', req.params.serial, 'shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/devices/:serial/swipe', async (req, res) => {
    const { x1, y1, x2, y2, duration } = req.body;
    try {
      await adbExec('-s', req.params.serial, 'shell', 'input', 'swipe',
        String(Math.round(x1)), String(Math.round(y1)),
        String(Math.round(x2)), String(Math.round(y2)),
        String(duration || 300));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/devices/:serial/key', async (req, res) => {
    try {
      await adbExec('-s', req.params.serial, 'shell', 'input', 'keyevent', String(req.body.keycode));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/devices/:serial/text', async (req, res) => {
    try {
      await adbExec('-s', req.params.serial, 'shell', 'input', 'text', req.body.text.replace(/ /g, '%s'));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
