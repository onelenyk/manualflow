import { Router } from 'express';
import { getAllTemplates, getTemplateById } from '../templates/templates.js';

export function templatesRoutes() {
  const router = Router();

  router.get('/templates', (_req, res) => {
    try {
      const templates = getAllTemplates();
      res.json(templates);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/templates/:id', (req, res) => {
    try {
      const template = getTemplateById(req.params.id);

      if (!template) {
        return res.status(404).json({ error: `Template not found: ${req.params.id}` });
      }

      res.json(template);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
