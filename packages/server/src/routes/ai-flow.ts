import path from 'path';
import fs from 'fs';
import { Router } from 'express';
import {
  prettifyFlow,
  verifyYaml,
  verifyFlow,
  extractCommonFlows,
  createFromPrompt,
  PRETTIFY_MAX_BYTES,
  VERIFY_YAML_MAX_BYTES,
  VERIFY_FLOW_MAX_BYTES,
  CREATE_PROMPT_MAX_BYTES,
  EXTRACT_MAX_FLOWS,
  EXTRACT_MAX_TOTAL_BYTES,
} from '../ai/flow-ops.js';
import { getMaestroProjectConfig } from '../config/maestro-project.js';

function asyncHandler(fn: (req: any, res: any, next: any) => Promise<any>) {
  return async (req: any, res: any, next: any) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      console.error('AI flow route error:', err);
      res.status(500).json({ error: 'Request failed', details: err instanceof Error ? err.message : String(err) });
    }
  };
}

export function aiFlowRoutes(): Router {
  const router = Router();

  router.post('/ai/flow/prettify', asyncHandler(async (req, res) => {
    const { yaml } = req.body || {};
    if (!yaml || typeof yaml !== 'string') {
      return res.status(400).json({ error: 'yaml is required (string)' });
    }
    const actual = Buffer.byteLength(yaml);
    if (actual > PRETTIFY_MAX_BYTES) {
      return res.status(413).json({ error: 'input-too-large', limit: PRETTIFY_MAX_BYTES, actual });
    }
    const result = await prettifyFlow(yaml);
    res.json(result);
  }));

  router.post('/ai/flow/verify-yaml', asyncHandler(async (req, res) => {
    const { yaml } = req.body || {};
    if (!yaml || typeof yaml !== 'string') {
      return res.status(400).json({ error: 'yaml is required (string)' });
    }
    const actual = Buffer.byteLength(yaml);
    if (actual > VERIFY_YAML_MAX_BYTES) {
      return res.status(413).json({ error: 'input-too-large', limit: VERIFY_YAML_MAX_BYTES, actual });
    }
    const result = verifyYaml(yaml);
    res.json(result);
  }));

  router.post('/ai/flow/verify-flow', asyncHandler(async (req, res) => {
    const { yaml } = req.body || {};
    if (!yaml || typeof yaml !== 'string') {
      return res.status(400).json({ error: 'yaml is required (string)' });
    }
    const actual = Buffer.byteLength(yaml);
    if (actual > VERIFY_FLOW_MAX_BYTES) {
      return res.status(413).json({ error: 'input-too-large', limit: VERIFY_FLOW_MAX_BYTES, actual });
    }
    const result = await verifyFlow(yaml);
    res.json(result);
  }));

  router.post('/ai/flow/extract-common', asyncHandler(async (req, res) => {
    const { flows } = req.body || {};
    if (!Array.isArray(flows) || flows.length === 0) {
      return res.status(400).json({ error: 'flows is required (non-empty array)' });
    }
    if (flows.length > EXTRACT_MAX_FLOWS) {
      return res.status(413).json({ error: 'input-too-large', limit: EXTRACT_MAX_FLOWS, actual: flows.length });
    }
    const totalBytes = flows.reduce((sum: number, f: { path: string; yaml: string }) => {
      return sum + Buffer.byteLength(typeof f.yaml === 'string' ? f.yaml : '');
    }, 0);
    if (totalBytes > EXTRACT_MAX_TOTAL_BYTES) {
      return res.status(413).json({ error: 'input-too-large', limit: EXTRACT_MAX_TOTAL_BYTES, actual: totalBytes });
    }
    const result = await extractCommonFlows(flows);
    res.json(result);
  }));

  router.post('/ai/flow/create-from-prompt', asyncHandler(async (req, res) => {
    const { prompt, appId, exampleFlows } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required (string)' });
    }
    const promptBytes = Buffer.byteLength(prompt);
    if (promptBytes > CREATE_PROMPT_MAX_BYTES) {
      return res.status(413).json({ error: 'input-too-large', limit: CREATE_PROMPT_MAX_BYTES, actual: promptBytes });
    }
    if (appId !== undefined) {
      if (typeof appId !== 'string' || !/^[a-z][\w.]+$/.test(appId)) {
        return res.status(400).json({ error: 'invalid appId format' });
      }
    }

    const projectConfig = getMaestroProjectConfig();
    if (!projectConfig.current) {
      return res.status(409).json({ error: 'no-project-open' });
    }
    const projectRoot = projectConfig.current;

    let result: { relativePath: string; draftPath: string; yaml: string; appIdUsed: string };
    try {
      result = await createFromPrompt({ prompt, appId, exampleFlows });
    } catch (err) {
      if (err instanceof Error && err.message === 'appId-required') {
        return res.status(400).json({ error: 'appId-required', details: 'Provide appId or exampleFlows containing an appId line' });
      }
      if (err instanceof Error && err.message.startsWith('Invalid appId format')) {
        return res.status(400).json({ error: 'invalid appId format', details: err.message });
      }
      throw err;
    }

    const draftPath = path.join(projectRoot, '.maestro', result.relativePath) + '.draft';
    const draftDir = path.dirname(draftPath);

    // Ensure directory exists
    try {
      fs.mkdirSync(draftDir, { recursive: true });
    } catch (e) {
      return res.status(500).json({ error: 'failed-to-create-directory', path: draftDir });
    }

    // Write draft file
    try {
      fs.writeFileSync(draftPath, result.yaml, 'utf-8');
    } catch (e) {
      return res.status(500).json({ error: 'failed-to-write-draft', path: draftPath });
    }

    res.json({ ...result, draftPath });
  }));

  return router;
}
