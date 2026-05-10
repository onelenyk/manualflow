import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface MaestroDetection {
  installed: boolean;
  path: string | null;
  version: string | null;
}

/**
 * Detects whether the Maestro CLI is on PATH. Maestro is intentionally NOT
 * bundled (plan §13 Q6 — heavyweight JVM dependency, fast-moving versions).
 *
 * The check runs `maestro --version`; on success, captures the first non-empty
 * line as the version string. On failure, reports `installed: false` so the UI
 * can surface an install hint.
 */
export async function detectMaestro(): Promise<MaestroDetection> {
  const which = process.platform === 'win32' ? 'where' : 'which';
  let foundPath: string | null = null;
  try {
    const { stdout } = await execFileAsync(which, ['maestro']);
    foundPath = stdout.trim().split(/\r?\n/)[0] || null;
  } catch {
    return { installed: false, path: null, version: null };
  }

  let version: string | null = null;
  try {
    const { stdout } = await execFileAsync('maestro', ['--version']);
    version = stdout.trim().split(/\r?\n/)[0] || null;
  } catch {
    // Found on PATH but `--version` failed; still report installed.
  }

  return { installed: true, path: foundPath, version };
}

export interface MaestroInstallHint {
  command: string;
  url: string;
}

export function maestroInstallHint(platform: NodeJS.Platform): MaestroInstallHint {
  const url = 'https://maestro.mobile.dev/getting-started/installing-maestro';
  switch (platform) {
    case 'darwin':
      return { command: 'brew tap mobile-dev-inc/tap && brew install maestro', url };
    case 'linux':
      return { command: 'curl -Ls "https://get.maestro.mobile.dev" | bash', url };
    case 'win32':
      return { command: 'See the docs — Maestro CLI on Windows requires WSL2.', url };
    default:
      return { command: 'See the docs.', url };
  }
}
