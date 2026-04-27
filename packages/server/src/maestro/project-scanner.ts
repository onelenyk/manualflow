import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';
import type { MaestroProject, MaestroFile, MaestroRules, MaestroScanInfo, MaestroProjectWarning } from '@maestro-recorder/shared';
import { validateMaestroYaml } from './yaml-validate.js';

const MAX_FILES = 1000;
const MAX_DEPTH = 12;

interface ScanState {
  files: MaestroFile[];
  scanned: number;
  truncated: boolean;
  capHit?: 'fileCount' | 'depth' | 'symlink';
  skippedExamples: string[];
  warnings: MaestroProjectWarning[];
  symlinkWarningEmitted: boolean;
}

async function scanDir(
  dir: string,
  maestroDir: string,
  depth: number,
  state: ScanState,
): Promise<void> {
  if (state.truncated) return;
  if (depth > MAX_DEPTH) {
    state.truncated = true;
    state.capHit = state.capHit ?? 'depth';
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (state.truncated) return;

    const fullPath = path.join(dir, entry.name);

    const lstat = await fs.promises.lstat(fullPath).catch(() => null);
    if (!lstat) continue;

    if (lstat.isSymbolicLink()) {
      if (!state.symlinkWarningEmitted) {
        state.symlinkWarningEmitted = true;
        state.warnings.push({
          code: 'SYMLINK_SKIPPED',
          message: 'One or more symbolic links were skipped during scan',
        });
      }
      if (state.skippedExamples.length < 5) {
        state.skippedExamples.push(fullPath);
      }
      continue;
    }

    if (lstat.isDirectory()) {
      await scanDir(fullPath, maestroDir, depth + 1, state);
      continue;
    }

    if (!lstat.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    const base = entry.name;

    if (ext === '.draft') {
      state.scanned++;
      if (state.scanned >= MAX_FILES) {
        state.truncated = true;
        state.capHit = state.capHit ?? 'fileCount';
        return;
      }
      const relativePath = path.relative(maestroDir, fullPath);
      state.files.push({
        path: fullPath,
        relativePath,
        kind: 'draft',
        name: base,
      });
      continue;
    }

    if (ext !== '.yaml' && ext !== '.yml') continue;

    state.scanned++;
    if (state.scanned >= MAX_FILES) {
      state.truncated = true;
      state.capHit = state.capHit ?? 'fileCount';
      return;
    }

    const relativePath = path.relative(maestroDir, fullPath);
    const isConfigFile =
      path.dirname(fullPath) === maestroDir &&
      (base === 'config.yaml' || base === 'config.yml');

    if (isConfigFile) {
      let raw: string | undefined;
      try {
        raw = await fs.promises.readFile(fullPath, 'utf8');
      } catch {}
      state.files.push({
        path: fullPath,
        relativePath,
        kind: 'config',
        name: base,
        raw,
      } as MaestroFile & { raw?: string });
      continue;
    }

    let text: string;
    try {
      text = await fs.promises.readFile(fullPath, 'utf8');
    } catch {
      state.files.push({
        path: fullPath,
        relativePath,
        kind: 'unknown',
        name: base,
        error: 'INVALID_YAML',
      });
      continue;
    }

    const result = validateMaestroYaml(text);
    if (!result.ok && result.errors.some(e => e.code === 'INVALID_YAML')) {
      state.files.push({
        path: fullPath,
        relativePath,
        kind: 'unknown',
        name: base,
        error: 'INVALID_YAML',
      });
      continue;
    }

    const parsed = safeParseYaml(text);
    const appId = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)['appId'] as string | undefined
      : undefined;

    state.files.push({
      path: fullPath,
      relativePath,
      kind: 'flow',
      name: base,
      appId: typeof appId === 'string' ? appId : undefined,
    });
  }
}

function safeParseYaml(text: string): unknown {
  try {
    return parse(text);
  } catch {
    return null;
  }
}

async function detectMaestroDir(rootPath: string): Promise<{ dir: string; warnings: MaestroProjectWarning[] }> {
  const warnings: MaestroProjectWarning[] = [];

  const dotMaestro = path.join(rootPath, '.maestro');
  const maestro = path.join(rootPath, 'maestro');

  const [hasDot, hasPlain] = await Promise.all([
    fs.promises.stat(dotMaestro).then(s => s.isDirectory()).catch(() => false),
    fs.promises.stat(maestro).then(s => s.isDirectory()).catch(() => false),
  ]);

  if (hasDot && hasPlain) {
    warnings.push({
      code: 'BOTH_MAESTRO_DIRS',
      message: 'Both .maestro/ and maestro/ directories found; using .maestro/',
    });
    return { dir: dotMaestro, warnings };
  }

  if (hasDot) return { dir: dotMaestro, warnings };
  if (hasPlain) return { dir: maestro, warnings };

  await scanRootForAppId(rootPath);
  return { dir: rootPath, warnings };
}

async function scanRootForAppId(rootPath: string): Promise<string | null> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(rootPath, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (ext !== '.yaml' && ext !== '.yml') continue;
    const fullPath = path.join(rootPath, entry.name);
    try {
      const text = await fs.promises.readFile(fullPath, 'utf8');
      const firstLine = text.split('\n').find(l => l.trim().length > 0);
      if (firstLine && firstLine.trimStart().startsWith('appId:')) {
        return fullPath;
      }
    } catch {}
  }
  return null;
}

function buildRules(files: (MaestroFile & { raw?: string })[], maestroDir: string): MaestroRules {
  const configEntry = files.find(f => f.kind === 'config');
  if (!configEntry) {
    return { present: false };
  }

  const raw = (configEntry as MaestroFile & { raw?: string }).raw;
  if (raw === undefined) {
    return { present: true };
  }

  try {
    const parsed = parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { present: true, raw, parseError: 'Config is not a YAML mapping' };
    }

    const executionOrder = parsed['executionOrder'] as Record<string, unknown> | undefined;
    const result: MaestroRules['parsed'] = {};

    if (executionOrder && typeof executionOrder === 'object') {
      result.executionOrder = {
        flowsOrder: Array.isArray(executionOrder['flowsOrder'])
          ? (executionOrder['flowsOrder'] as string[])
          : undefined,
        continueOnFailure: typeof executionOrder['continueOnFailure'] === 'boolean'
          ? executionOrder['continueOnFailure']
          : undefined,
      };
    }

    if (Array.isArray(parsed['tags'])) result.tags = parsed['tags'] as string[];
    if (Array.isArray(parsed['includeTags'])) result.includeTags = parsed['includeTags'] as string[];
    if (Array.isArray(parsed['excludeTags'])) result.excludeTags = parsed['excludeTags'] as string[];
    if (parsed['env'] && typeof parsed['env'] === 'object' && !Array.isArray(parsed['env'])) {
      result.env = parsed['env'] as Record<string, string>;
    }
    if (typeof parsed['appId'] === 'string') result.appId = parsed['appId'];
    if (Array.isArray(parsed['flows'])) result.flows = parsed['flows'] as string[];

    return { present: true, raw, parsed: result };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { present: true, raw, parseError: msg };
  }
}

function mergeDrafts(files: MaestroFile[]): MaestroFile[] {
  const flowsByBase = new Map<string, MaestroFile>();

  for (const f of files) {
    if (f.kind === 'flow' || f.kind === 'unknown') {
      const dir = path.dirname(f.path);
      const ext = path.extname(f.name);
      const base = path.basename(f.name, ext);
      const key = path.join(dir, base);
      flowsByBase.set(key, f);
    }
  }

  const result: MaestroFile[] = [];
  for (const f of files) {
    if (f.kind === 'draft') {
      const dir = path.dirname(f.path);
      const base = path.basename(f.name, '.draft');
      const keyYaml = path.join(dir, base);
      const sibling = flowsByBase.get(keyYaml);
      if (sibling) {
        sibling.hasDraft = true;
        continue;
      }
    }
    result.push(f);
  }
  return result;
}

export async function scanMaestroProject(rootPath: string): Promise<MaestroProject> {
  const { dir: maestroDir, warnings: dirWarnings } = await detectMaestroDir(rootPath);

  const state: ScanState = {
    files: [],
    scanned: 0,
    truncated: false,
    skippedExamples: [],
    warnings: [...dirWarnings],
    symlinkWarningEmitted: false,
  };

  await scanDir(maestroDir, maestroDir, 0, state);

  if (state.truncated) {
    state.warnings.push({
      code: 'SCAN_TRUNCATED',
      message: `Scan stopped after ${state.scanned} files (cap: ${state.capHit ?? 'unknown'})`,
    });
  }

  const mergedFiles = mergeDrafts(state.files as (MaestroFile & { raw?: string })[]);
  const rules = buildRules(state.files as (MaestroFile & { raw?: string })[], maestroDir);

  const scanInfo: MaestroScanInfo = {
    truncated: state.truncated,
    scanned: state.scanned,
    capHit: state.capHit,
    skippedExamples: state.skippedExamples,
  };

  return {
    rootPath,
    maestroDir,
    files: mergedFiles,
    rules,
    scanInfo,
    warnings: state.warnings,
    scannedAt: Date.now(),
  };
}
