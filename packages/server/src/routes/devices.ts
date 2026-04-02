import { Router } from 'express';
import { adbExec, type AppState } from '../index.js';

export function deviceRoutes(state: AppState) {
  const router = Router();

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

  router.post('/devices/:serial/select', (req, res) => {
    state.activeDevice = req.params.serial;
    res.json({ selected: req.params.serial });
  });

  // Touch input via ADB
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
    const { keycode } = req.body;
    try {
      await adbExec('-s', req.params.serial, 'shell', 'input', 'keyevent', String(keycode));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/devices/:serial/text', async (req, res) => {
    const { text } = req.body;
    try {
      await adbExec('-s', req.params.serial, 'shell', 'input', 'text', text.replace(/ /g, '%s'));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
