import path from 'node:path';
import fs from 'node:fs';

export interface AdbResolution {
  /** Absolute path to the bundled adb binary, or null when not found. */
  adbPath: string | null;
  /** PATH-prefix value the supervisor can prepend to the child env. */
  pathPrefix: string | null;
}

export interface ResolveAdbOptions {
  /** Explicit override (e.g. for tests). */
  override?: string;
  /** Repo root in dev (where packages/electron lives). */
  devRoot?: string;
  /** Packaged app's resourcesPath. */
  resourcesPath?: string;
}

/**
 * Resolves the absolute path to the platform-specific bundled `adb` binary.
 *
 * Layout (per plan §9):
 *   <root>/platform-tools/<platform>-<arch>/adb[.exe]
 *
 * In packaged mode <root> is process.resourcesPath. In dev <root> is
 * packages/electron/resources/.
 */
export function resolveBundledAdb(opts: ResolveAdbOptions = {}): AdbResolution {
  if (opts.override && fs.existsSync(opts.override)) {
    return { adbPath: opts.override, pathPrefix: path.dirname(opts.override) };
  }

  const archKey = `${process.platform}-${process.arch}`;
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';

  const candidates: string[] = [];
  if (opts.resourcesPath) {
    candidates.push(path.join(opts.resourcesPath, 'platform-tools', archKey, exe));
  }
  if (opts.devRoot) {
    candidates.push(path.join(opts.devRoot, 'resources', 'platform-tools', archKey, exe));
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return { adbPath: p, pathPrefix: path.dirname(p) };
    }
  }

  return { adbPath: null, pathPrefix: null };
}
