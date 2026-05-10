import { ChildProcess, spawn } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ServerHandle {
  proc: ChildProcess;
  port: number;
  host: string;
  httpBase: string;
  wsBase: string;
}

export interface StartServerOptions {
  /**
   * Absolute path to the server entry the supervisor should run.
   *
   * In packaged mode this points at the `tsc`-emitted CJS file under
   * `Resources/server/dist/index.js`. In dev mode it can be either the
   * compiled dist (matches packaged behavior) or `packages/server/src/index.ts`
   * via `tsx` — see `dev` flag.
   */
  serverEntry: string;
  /** When true, run the entry through `tsx`; otherwise via `ELECTRON_RUN_AS_NODE`. */
  dev?: boolean;
  /** cwd for the spawned child. */
  cwd?: string;
  /** MANUALFLOW_ADB_PATH override (absolute path to bundled adb). */
  adbPath?: string;
  /** MANUALFLOW_STATIC_DIR override (absolute path to built frontend). */
  staticDir?: string;
  /** Extra env to merge on top of the inherited environment. */
  extraEnv?: NodeJS.ProcessEnv;
  /** How long to wait for `MANUALFLOW_READY` before giving up. Default 5000 ms. */
  readyTimeoutMs?: number;
  /** Optional log drain (line, stream). */
  onLog?: (line: string, stream: 'stdout' | 'stderr') => void;
}

const READY_RE = /^MANUALFLOW_READY (.+)$/;
const TAIL_LIMIT = 50;

function portFilePath(): string {
  return path.join(os.homedir(), '.manualflow', 'port');
}

function clearPortFile(): void {
  try {
    const p = portFilePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '');
  } catch {
    // best-effort
  }
}

function writePortFile(port: number): void {
  try {
    fs.writeFileSync(portFilePath(), String(port));
  } catch {
    // best-effort
  }
}

export function startServer(opts: StartServerOptions): Promise<ServerHandle> {
  // Truncate the port file BEFORE the spawn so an external observer never reads
  // a stale port from a previous run while we're in the boot window.
  clearPortFile();

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: '0',
    HOST: '127.0.0.1',
    ANDROID_ADB_SERVER_PORT: '5038',
    ...(opts.adbPath ? { MANUALFLOW_ADB_PATH: opts.adbPath } : {}),
    ...(opts.staticDir ? { MANUALFLOW_STATIC_DIR: opts.staticDir } : {}),
    ...(opts.extraEnv ?? {}),
  };

  let cmd: string;
  let args: string[];
  if (opts.dev) {
    // Dev path uses tsx so we don't need a build step. The supervisor still
    // runs through the same spawn/handshake/teardown contract.
    cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    args = ['tsx', opts.serverEntry];
  } else {
    cmd = process.execPath;
    args = [opts.serverEntry];
    env.ELECTRON_RUN_AS_NODE = '1';
  }

  const child = spawn(cmd, args, {
    cwd: opts.cwd ?? process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdoutTail: string[] = [];
  const stderrTail: string[] = [];
  const pushTail = (buf: string[], line: string) => {
    buf.push(line);
    if (buf.length > TAIL_LIMIT) buf.shift();
  };

  // Attach the readline parser BEFORE any other consumer reads stdout so we
  // can never miss the first matching line.
  const rl = readline.createInterface({ input: child.stdout! });
  const stderrRl = readline.createInterface({ input: child.stderr! });

  return new Promise<ServerHandle>((resolve, reject) => {
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rl.removeAllListeners('line');
      stderrRl.removeAllListeners('line');
      child.removeListener('exit', onExit);
      fn();
    };

    const fail = (err: Error) => settle(() => {
      const tail = [
        '--- stdout (last 50) ---',
        ...stdoutTail,
        '--- stderr (last 50) ---',
        ...stderrTail,
      ].join('\n');
      reject(new Error(`${err.message}\n${tail}`));
    });

    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      try { rl.close(); } catch {}
      try { stderrRl.close(); } catch {}
      fail(new Error(`server did not emit MANUALFLOW_READY within ${opts.readyTimeoutMs ?? 5000}ms`));
    }, opts.readyTimeoutMs ?? 5000);

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      fail(new Error(`server exited before ready (code=${code} signal=${signal})`));
    };
    child.once('exit', onExit);

    rl.on('line', (line) => {
      pushTail(stdoutTail, line);
      opts.onLog?.(line, 'stdout');
      const m = READY_RE.exec(line);
      if (!m) return;
      try {
        const ready = JSON.parse(m[1]) as { port: number; host: string };
        const httpBase = `http://${ready.host}:${ready.port}`;
        const wsBase = `ws://${ready.host}:${ready.port}`;
        writePortFile(ready.port);
        settle(() => resolve({
          proc: child,
          port: ready.port,
          host: ready.host,
          httpBase,
          wsBase,
        }));
      } catch (e) {
        fail(new Error(`failed to parse READY payload: ${(e as Error).message}`));
      }
    });

    stderrRl.on('line', (line) => {
      pushTail(stderrTail, line);
      opts.onLog?.(line, 'stderr');
    });
  });
}

export async function stopServer(handle: ServerHandle | null, timeoutMs = 3000): Promise<void> {
  if (!handle) return;
  const { proc } = handle;

  await new Promise<void>((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve();
      return;
    }
    const kill = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
    }, timeoutMs);
    proc.once('exit', () => {
      clearTimeout(kill);
      resolve();
    });
    try { proc.kill('SIGTERM'); } catch {
      clearTimeout(kill);
      resolve();
    }
  });

  // Clear the port file regardless of how the child exited so external
  // observers see "server not running" instead of a stale port.
  clearPortFile();
}
