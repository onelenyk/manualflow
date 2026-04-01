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

  return router;
}
