import { Router } from 'express';
import type { AppState } from '../index.js';

export function recordingRoutes(state: AppState) {
  const router = Router();

  // Start recording - initialize device stream
  router.post('/recording/start', async (req, res) => {
    const { deviceSerial } = req.body;
    const serial = deviceSerial || state.activeDevice;

    if (!serial) {
      return res.status(400).json({ error: 'No device selected' });
    }

    try {
      // Ensure device stream is connected to this device
      if (state.deviceStream) {
        await state.deviceStream.connect(serial);
      }
      res.json({ ok: true, device: serial });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Stop recording
  router.post('/recording/stop', async (req, res) => {
    try {
      if (state.deviceStream) {
        state.deviceStream.disconnect();
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get recording status
  router.get('/recording/status', (_req, res) => {
    const ds = state.deviceStream;
    res.json({
      recording: ds?.connected ?? false,
      device: ds?.deviceSerial ?? null,
      interactionCount: ds?.interactions.length ?? 0,
    });
  });

  return router;
}
