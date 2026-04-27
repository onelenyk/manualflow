import { Router } from 'express';
import { analyzeFlow, enhanceFromInteractions } from '../ai/flow-enhancer.js';
import { getOpenRouterStatus, saveStoredConfig, clearStoredConfig } from '../config/ai.js';

function asyncHandler(fn: (req: any, res: any, next: any) => Promise<any>) {
  return async (req: any, res: any, next: any) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      console.error('AI route error:', err);
      res.status(500).json({ error: 'Request failed', details: err instanceof Error ? err.message : String(err) });
    }
  };
}

export function aiRoutes() {
  const router = Router();

  router.get('/ai/status', (_req, res) => {
    res.json(getOpenRouterStatus());
  });

  router.post('/ai/config', (req, res) => {
    const { apiKey, model } = req.body || {};
    try {
      const result = saveStoredConfig({ apiKey, model });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid config' });
    }
  });

  router.delete('/ai/config', (_req, res) => {
    res.json(clearStoredConfig());
  });

  router.post('/ai/enhance-flow', asyncHandler(async (req, res) => {
    const { yaml } = req.body;
    if (!yaml || typeof yaml !== 'string') {
      return res.status(400).json({ error: 'yaml is required (string)' });
    }
    const result = await analyzeFlow(yaml);
    res.json(result);
  }));

  router.post('/ai/enhance-interactions', asyncHandler(async (req, res) => {
    const { interactions } = req.body;
    if (!Array.isArray(interactions)) {
      return res.status(400).json({ error: 'interactions is required (array)' });
    }
    const result = await enhanceFromInteractions(interactions);
    res.json(result);
  }));

  return router;
}
