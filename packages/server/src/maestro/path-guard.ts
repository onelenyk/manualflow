import fs from 'fs';
import path from 'path';

let cachedRealRoot: Map<string, string> = new Map();

function realRoot(root: string): string {
  const cached = cachedRealRoot.get(root);
  if (cached !== undefined) return cached;
  const real = fs.realpathSync(root);
  cachedRealRoot.set(root, real);
  return real;
}

function guardError(): Error {
  const err = new Error('path guard violation') as Error & { code: string };
  (err as any).code = 'PATH_GUARD';
  return err;
}

function isInsideRoot(realRootPath: string, realTarget: string): boolean {
  const rel = path.relative(realRootPath, realTarget);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function assertExistingPath(root: string, target: string): string {
  const realRootPath = realRoot(root);
  let realTarget: string;
  try {
    realTarget = fs.realpathSync(target);
  } catch {
    throw guardError();
  }
  fs.lstatSync(realTarget);
  if (!isInsideRoot(realRootPath, realTarget)) {
    throw guardError();
  }
  return realTarget;
}

export function assertCreatePath(root: string, target: string): string {
  const realRootPath = realRoot(root);

  const base = path.basename(target);
  if (!base || base.includes(path.sep) || base.includes('/') || base.includes('\x00')) {
    throw guardError();
  }

  const dir = path.dirname(target);

  // Walk the raw (pre-realpathSync) directory chain from dir upward, checking
  // each component with lstat to detect symlinks before resolution.
  // Stop as soon as we reach a component whose realpath equals realRootPath.
  let walkDir = path.resolve(dir);
  while (true) {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(walkDir);
    } catch {
      throw guardError();
    }
    if (stat.isSymbolicLink()) throw guardError();
    if (!stat.isDirectory()) throw guardError();

    // Check if this component is (or resolves to) the root boundary
    let realWalk: string;
    try {
      realWalk = fs.realpathSync(walkDir);
    } catch {
      throw guardError();
    }
    if (realWalk === realRootPath) break;

    const parent = path.dirname(walkDir);
    if (parent === walkDir) {
      // Reached filesystem root without finding realRootPath — outside root
      throw guardError();
    }
    walkDir = parent;
  }

  // Now resolve the dir itself (after symlink-free verification)
  let realDir: string;
  try {
    realDir = fs.realpathSync(dir);
  } catch {
    throw guardError();
  }

  const resolvedTarget = path.join(realDir, base);
  if (!resolvedTarget.startsWith(realRootPath + path.sep) && resolvedTarget !== realRootPath) {
    throw guardError();
  }

  return resolvedTarget;
}
