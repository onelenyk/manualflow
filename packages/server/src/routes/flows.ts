import { Router } from 'express';
import { FlowStorage } from '../storage/flow-storage.js';

const storage = new FlowStorage();

export function flowRoutes() {
  const router = Router();

  router.get('/flows', (_req, res) => {
    res.json(storage.list());
  });

  router.get('/flows/:id', (req, res) => {
    const flow = storage.get(req.params.id);
    if (!flow) return res.status(404).json({ error: 'Flow not found' });
    res.json({ id: flow.meta.id, name: flow.meta.name, yaml: flow.yaml, commandCount: flow.meta.commandCount, createdAt: flow.meta.createdAt });
  });

  router.post('/flows', (req, res) => {
    const { name, yaml } = req.body;
    if (!name || !yaml) return res.status(400).json({ error: 'name and yaml required' });
    const meta = storage.save(name, yaml);
    res.json(meta);
  });

  router.put('/flows/:id', (req, res) => {
    const result = storage.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Flow not found' });
    res.json(result);
  });

  router.delete('/flows/:id', (req, res) => {
    const ok = storage.delete(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Flow not found' });
    res.json({ ok: true });
  });

  router.post('/flows/:id/duplicate', (req, res) => {
    const { name } = req.body;
    const meta = storage.duplicate(req.params.id, name || 'Copy');
    if (!meta) return res.status(404).json({ error: 'Flow not found' });
    res.json(meta);
  });

  return router;
}
