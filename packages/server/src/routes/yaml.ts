import { Router } from 'express';
import { validateCommands } from '../recording/yaml-validator.js';

export function yamlRoutes() {
  const router = Router();

  router.post('/yaml/validate', (req, res) => {
    try {
      const { commands } = req.body;

      if (!Array.isArray(commands)) {
        return res.status(400).json({
          valid: false,
          errors: [
            {
              index: -1,
              command: 'root',
              field: 'commands',
              message: 'Body must contain "commands" array',
            },
          ],
        });
      }

      const result = validateCommands(commands);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({
        valid: false,
        errors: [
          {
            index: -1,
            command: 'root',
            field: 'validation',
            message: `Validation error: ${e.message}`,
          },
        ],
      });
    }
  });

  return router;
}
