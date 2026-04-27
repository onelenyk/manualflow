import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import type { AppState } from '../index.js';
import { getMaestroProjectConfig, saveMaestroProjectConfig } from '../config/maestro-project.js';
import { assertExistingPath, assertCreatePath } from '../maestro/path-guard.js';
import { sha256OfFile } from '../maestro/sha.js';
import { scanMaestroProject } from '../maestro/project-scanner.js';
import { runner } from './runner.js';
import { DeviceBusyError } from '../runner/test-runner.js';
import { stopAgent, startAgent } from '../agent/agent-lifecycle.js';

function asyncHandler(fn: (req: any, res: any, next: any) => Promise<any>) {
  return async (req: any, res: any, next: any) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (err && typeof err === 'object' && (err as any).code === 'PATH_GUARD') {
        return res.status(403).json({ error: 'path-guard' });
      }
      console.error('Maestro route error:', err);
      res.status(500).json({ error: 'Request failed', details: err instanceof Error ? err.message : String(err) });
    }
  };
}

function moveToFront(list: string[], value: string, max = 10): string[] {
  const filtered = list.filter(p => p !== value);
  filtered.unshift(value);
  return filtered.slice(0, max);
}

function isPathGuardError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as any).code === 'PATH_GUARD';
}

export function maestroRoutes(state: AppState): Router {
  const router = Router();

  router.post('/maestro/project', asyncHandler(async (req, res) => {
    const { folderPath } = req.body || {};
    if (!folderPath || typeof folderPath !== 'string') {
      return res.status(400).json({ error: 'folderPath required' });
    }

    let isDir = false;
    try {
      isDir = fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) {
      return res.status(404).json({ error: 'folder-not-found' });
    }

    const project = await scanMaestroProject(folderPath);

    const cfg = getMaestroProjectConfig();
    const newRecents = moveToFront(cfg.recents, folderPath, 10);
    saveMaestroProjectConfig({ current: folderPath, recents: newRecents });

    res.json(project);
  }));

  router.get('/maestro/project', asyncHandler(async (_req, res) => {
    const cfg = getMaestroProjectConfig();

    const validRecents = cfg.recents.filter(p => {
      try { return fs.existsSync(p); } catch { return false; }
    });

    if (validRecents.length !== cfg.recents.length) {
      saveMaestroProjectConfig({
        current: cfg.current && fs.existsSync(cfg.current) ? cfg.current : null,
        recents: validRecents,
      });
    }

    if (!cfg.current || !fs.existsSync(cfg.current)) {
      return res.json({ project: null, recents: validRecents });
    }

    const project = await scanMaestroProject(cfg.current);
    res.json({ project, recents: validRecents });
  }));

  router.get('/maestro/flow', asyncHandler(async (req, res) => {
    const p = req.query.path;
    if (!p || typeof p !== 'string') {
      return res.status(400).json({ error: 'path required' });
    }

    const cfg = getMaestroProjectConfig();
    if (!cfg.current) {
      return res.status(409).json({ error: 'no-project-open' });
    }

    let realpath: string;
    try {
      realpath = assertExistingPath(cfg.current, p);
    } catch (err) {
      if (isPathGuardError(err)) return res.status(403).json({ error: 'path-guard' });
      throw err;
    }

    const yaml = await fs.promises.readFile(realpath, 'utf-8');
    const sha = await sha256OfFile(realpath);

    const draftPath = p + '.draft';
    let draft: { yaml: string; sha: string } | null = null;
    try {
      const realDraft = assertExistingPath(cfg.current, draftPath);
      const draftYaml = await fs.promises.readFile(realDraft, 'utf-8');
      const draftSha = await sha256OfFile(realDraft);
      draft = { yaml: draftYaml, sha: draftSha };
    } catch {
      draft = null;
    }

    res.json({ yaml, sha, draft });
  }));

  router.put('/maestro/draft', asyncHandler(async (req, res) => {
    const { path: p, yaml } = req.body || {};
    if (!p || typeof p !== 'string' || typeof yaml !== 'string') {
      return res.status(400).json({ error: 'path and yaml required' });
    }

    const cfg = getMaestroProjectConfig();
    if (!cfg.current) {
      return res.status(409).json({ error: 'no-project-open' });
    }

    const draftPath = p + '.draft';

    let resolvedDraft: string;
    try {
      // If draft already exists, prefer the existing-path resolver (it follows
      // the realpath); otherwise create-path validates the parent chain.
      if (fs.existsSync(draftPath)) {
        resolvedDraft = assertExistingPath(cfg.current, draftPath);
      } else {
        resolvedDraft = assertCreatePath(cfg.current, draftPath);
      }
    } catch (err) {
      if (isPathGuardError(err)) return res.status(403).json({ error: 'path-guard' });
      throw err;
    }

    await fs.promises.writeFile(resolvedDraft, yaml, 'utf-8');
    const sha = await sha256OfFile(resolvedDraft);

    res.json({ draftPath: resolvedDraft, sha });
  }));

  router.delete('/maestro/draft', asyncHandler(async (req, res) => {
    const p = req.query.path;
    if (!p || typeof p !== 'string') {
      return res.status(400).json({ error: 'path required' });
    }

    const cfg = getMaestroProjectConfig();
    if (!cfg.current) {
      return res.status(409).json({ error: 'no-project-open' });
    }

    const draftPath = p + '.draft';
    if (!fs.existsSync(draftPath)) {
      return res.status(404).json({ error: 'draft-not-found' });
    }

    let resolved: string;
    try {
      resolved = assertExistingPath(cfg.current, draftPath);
    } catch (err) {
      if (isPathGuardError(err)) return res.status(403).json({ error: 'path-guard' });
      throw err;
    }

    await fs.promises.unlink(resolved);
    res.json({ ok: true });
  }));

  // Save a flow (create or overwrite). On overwrite, expectedSha gates against
  // concurrent edits; sha-mismatch returns the disk version + the attempt.
  router.post('/maestro/flow', asyncHandler(async (req, res) => {
    const { path: p, yaml, expectedSha } = req.body || {};
    if (!p || typeof p !== 'string' || typeof yaml !== 'string') {
      return res.status(400).json({ error: 'path and yaml required' });
    }

    const cfg = getMaestroProjectConfig();
    if (!cfg.current) {
      return res.status(409).json({ error: 'no-project-open' });
    }

    const exists = fs.existsSync(p);

    if (!exists) {
      let resolved: string;
      try {
        resolved = assertCreatePath(cfg.current, p);
      } catch (err) {
        if (isPathGuardError(err)) return res.status(403).json({ error: 'path-guard' });
        throw err;
      }
      await fs.promises.writeFile(resolved, yaml, 'utf-8');
      const sha = await sha256OfFile(resolved);
      return res.json({ path: resolved, sha });
    }

    let resolved: string;
    try {
      resolved = assertExistingPath(cfg.current, p);
    } catch (err) {
      if (isPathGuardError(err)) return res.status(403).json({ error: 'path-guard' });
      throw err;
    }

    const diskSha = await sha256OfFile(resolved);
    if (typeof expectedSha === 'string' && expectedSha !== diskSha) {
      const diskYaml = await fs.promises.readFile(resolved, 'utf-8');
      return res.status(409).json({
        error: 'sha-mismatch',
        disk: diskYaml,
        attempted: yaml,
        baseSha: diskSha,
      });
    }

    await fs.promises.writeFile(resolved, yaml, 'utf-8');
    const newSha = await sha256OfFile(resolved);

    // Atomic draft promotion: if a sibling draft existed, drop it now that the
    // canonical version is on disk.
    const draftPath = p + '.draft';
    await fs.promises.unlink(draftPath).catch(() => {});

    res.json({ path: resolved, sha: newSha });
  }));

  router.post('/maestro/runs', asyncHandler(async (req, res) => {
    const { flowPath, deviceSerial } = req.body || {};
    if (!flowPath || typeof flowPath !== 'string') {
      return res.status(400).json({ error: 'flowPath required' });
    }

    const cfg = getMaestroProjectConfig();
    if (!cfg.current) {
      return res.status(409).json({ error: 'no-project-open' });
    }

    let resolvedFlow: string;
    try {
      resolvedFlow = assertExistingPath(cfg.current, flowPath);
    } catch (err) {
      if (isPathGuardError(err)) return res.status(403).json({ error: 'path-guard' });
      throw err;
    }

    const serial = deviceSerial || state.activeDevice || undefined;

    // Hand off UiAutomation only after the runner reserves the serial.
    const preStart = serial
      ? async () => { try { await stopAgent(state, serial); } catch {} }
      : undefined;

    let run;
    try {
      run = await runner.start(resolvedFlow, path.basename(resolvedFlow), resolvedFlow, serial, preStart);
    } catch (err) {
      if (err instanceof DeviceBusyError) {
        return res.status(409).json({
          error: 'device-busy',
          deviceSerial: err.deviceSerial,
          activeRunId: err.activeRunId,
        });
      }
      // preStart already ran (we got past reservation); restart agent before bailing.
      if (serial) startAgent(state, serial).catch(() => {});
      throw err;
    }

    if (serial) {
      runner.once(`done:${run.id}`, () => {
        startAgent(state, serial).catch(() => {});
      });
    }

    res.json(run);
  }));

  return router;
}
