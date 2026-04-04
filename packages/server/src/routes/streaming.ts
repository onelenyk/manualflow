import { Router } from 'express';
import type { AppState } from '../index.js';
import { mapInteractionsToCommands } from '../recording/command-mapper.js';
import { YamlGenerator } from '../recording/yaml-generator.js';

export function streamingRoutes(state: AppState) {
  const router = Router();
  const yamlGenerator = new YamlGenerator();

  // Stream status
  router.get('/stream/status', (_req, res) => {
    const ds = state.deviceStream;
    res.json({
      connected: ds?.connected ?? false,
      device: ds?.deviceSerial ?? null,
      interactionCount: ds?.interactions.length ?? 0,
    });
  });

  // SSE stream for RecordedInteraction objects
  router.get('/stream/interactions', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const ds = state.deviceStream;
    if (!ds || !ds.connected) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream not connected' })}\n\n`);
      // Don't end — keep open so frontend can receive when stream connects
    }

    // Catch up: send existing interactions
    if (ds) {
      for (const interaction of ds.interactions) {
        res.write(`data: ${JSON.stringify({ type: 'interaction:complete', interaction })}\n\n`);
      }
    }

    const onCreated = (interaction: any) => {
      res.write(`data: ${JSON.stringify({ type: 'interaction:created', interaction })}\n\n`);
    };
    const onUpdated = (interaction: any) => {
      res.write(`data: ${JSON.stringify({ type: 'interaction:updated', interaction })}\n\n`);
    };
    const onComplete = (interaction: any) => {
      res.write(`data: ${JSON.stringify({ type: 'interaction:complete', interaction })}\n\n`);
    };
    const onConnected = () => {
      res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    };
    const onDisconnected = () => {
      res.write(`data: ${JSON.stringify({ type: 'disconnected' })}\n\n`);
    };

    if (ds) {
      ds.on('interaction:created', onCreated);
      ds.on('interaction:updated', onUpdated);
      ds.on('interaction:complete', onComplete);
      ds.on('connected', onConnected);
      ds.on('disconnected', onDisconnected);
    }

    req.on('close', () => {
      if (ds) {
        ds.off('interaction:created', onCreated);
        ds.off('interaction:updated', onUpdated);
        ds.off('interaction:complete', onComplete);
        ds.off('connected', onConnected);
        ds.off('disconnected', onDisconnected);
      }
    });
  });

  // SSE stream for raw getevent lines
  router.get('/stream/raw', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const ds = state.deviceStream;
    if (!ds || !ds.connected) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream not connected' })}\n\n`);
    }

    const onRaw = (line: any) => {
      res.write(`data: ${JSON.stringify({ type: 'raw', line })}\n\n`);
    };

    if (ds) {
      ds.on('raw', onRaw);
    }

    req.on('close', () => {
      if (ds) ds.off('raw', onRaw);
    });
  });

  // Export: generate YAML from selected interaction IDs
  router.post('/stream/export', (req, res) => {
    const ds = state.deviceStream;
    if (!ds) {
      return res.status(400).json({ error: 'No device stream' });
    }

    const { appId, interactionIds } = req.body;
    if (!appId || !Array.isArray(interactionIds) || interactionIds.length === 0) {
      return res.status(400).json({ error: 'appId and interactionIds[] required' });
    }

    const selected = ds.getInteractionsByIds(interactionIds);
    if (selected.length === 0) {
      return res.status(404).json({ error: 'No matching interactions found' });
    }

    const commands = mapInteractionsToCommands(selected);
    const yaml = yamlGenerator.generate(appId, [{ type: 'launchApp' }, ...commands]);

    res.json({ yaml, commandCount: commands.length + 1, interactionCount: selected.length });
  });

  // Force reconnect
  router.post('/stream/reconnect', async (_req, res) => {
    const ds = state.deviceStream;
    const serial = state.activeDevice;
    if (!ds || !serial) {
      return res.status(400).json({ error: 'No device selected' });
    }

    try {
      ds.disconnect();
      await ds.connect(serial);
      res.json({ status: 'reconnected' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Clear interactions buffer
  router.post('/stream/clear', (_req, res) => {
    state.deviceStream?.clear();
    res.json({ status: 'cleared' });
  });

  return router;
}
