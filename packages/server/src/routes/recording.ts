import { Router } from 'express';
import { RecordingSession } from '../recording/recording-session.js';
import type { AppState } from '../index.js';

export function recordingRoutes(state: AppState) {
  const router = Router();

  router.post('/recording/start', async (req, res) => {
    if (state.recordingSession) {
      return res.status(409).json({ error: 'Recording already in progress' });
    }

    const { deviceSerial, appId } = req.body;
    const serial = deviceSerial || state.activeDevice;
    if (!serial) {
      return res.status(400).json({ error: 'No device selected' });
    }

    try {
      const session = new RecordingSession(serial, appId || 'com.unknown.app');
      await session.start();
      state.recordingSession = session;
      res.json({ status: 'recording', device: serial });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/recording/stop', async (_req, res) => {
    if (!state.recordingSession) {
      return res.status(400).json({ error: 'Not recording' });
    }

    try {
      const result = await state.recordingSession.stop();
      const session = state.recordingSession;
      state.recordingSession = null;
      res.json({
        yaml: result.yaml,
        commandCount: result.commands.length,
      });
    } catch (e: any) {
      state.recordingSession = null;
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/recording/status', (_req, res) => {
    res.json({
      recording: state.recordingSession !== null,
      commandCount: state.recordingSession?.commands.length || 0,
    });
  });

  // SSE event stream for real-time actions
  router.get('/recording/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const session = state.recordingSession;
    if (!session) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Not recording' })}\n\n`);
      res.end();
      return;
    }

    // Send existing commands first (catch up)
    for (const cmd of session.commands) {
      res.write(`data: ${JSON.stringify({ type: 'command', command: cmd })}\n\n`);
    }

    const onCommand = (cmd: any) => {
      res.write(`data: ${JSON.stringify({ type: 'command', command: cmd })}\n\n`);
    };

    const onStatus = (status: string) => {
      res.write(`data: ${JSON.stringify({ type: 'status', state: status })}\n\n`);
    };

    session.on('command', onCommand);
    session.on('status', onStatus);

    req.on('close', () => {
      session.off('command', onCommand);
      session.off('status', onStatus);
    });
  });

  // SSE stream for parsed actions (before element lookup)
  router.get('/recording/actions', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const session = state.recordingSession;
    if (!session) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Not recording' })}\n\n`);
      res.end();
      return;
    }

    const onAction = (action: any) => {
      res.write(`data: ${JSON.stringify({ type: 'action', action })}\n\n`);
    };

    session.on('action', onAction);

    req.on('close', () => {
      session.off('action', onAction);
    });
  });

  return router;
}
