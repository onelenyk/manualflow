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

  // Resolve target relative to root
  const fullTarget = path.resolve(root, target);

  // For the initial bounds check, normalize both paths through realpath
  // to handle /var -> /private/var symlinks on macOS
  let realFullTarget: string;
  try {
    realFullTarget = fs.realpathSync(path.dirname(fullTarget));
    realFullTarget = path.join(realFullTarget, path.basename(fullTarget));
  } catch {
    // Parent doesn't exist yet, try to normalize what we can
    // Walk up until we find a directory that exists
    let checkPath = fullTarget;
    const parts: string[] = [];
    while (true) {
      try {
        const real = fs.realpathSync(checkPath);
        realFullTarget = path.join(real, ...parts.reverse());
        break;
      } catch {
        const basename = path.basename(checkPath);
        parts.push(basename);
        checkPath = path.dirname(checkPath);
        if (checkPath === basename) {
          // Reached filesystem root
          realFullTarget = fullTarget;
          break;
        }
      }
    }
  }

  // Check bounds using real paths
  const rel = path.relative(realRootPath, realFullTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw guardError();
  }

  const dir = path.dirname(target);
  const fullDir = path.dirname(fullTarget);

  // Walk the directory chain from fullDir upward to check for symlink escapes
  // Skip non-existent directories (they'll be created when the file is written)
  let walkDir = fullDir;
  while (true) {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(walkDir);
    } catch {
      // Directory doesn't exist yet - check parent
      const parent = path.dirname(walkDir);
      if (parent === walkDir) {
        // Reached filesystem root without finding realRootPath
        throw guardError();
      }
      walkDir = parent;
      continue;
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

  return fullTarget;
}
