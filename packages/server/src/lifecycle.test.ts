import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVER_ENTRY = path.resolve(__dirname, 'index.ts');

// Spawn the server with PORT=0 and capture the MANUALFLOW_READY line. This
// is the contract the Electron supervisor will rely on (plan §6).
function spawnServer() {
  const proc = spawn('npx', ['tsx', SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const rl = readline.createInterface({ input: proc.stdout });
  return { proc, rl };
}

async function awaitReadyLine(rl: readline.Interface, timeoutMs: number): Promise<{ port: number; host: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      rl.removeAllListeners('line');
      reject(new Error(`no MANUALFLOW_READY within ${timeoutMs}ms`));
    }, timeoutMs);
    rl.on('line', (line) => {
      const m = /^MANUALFLOW_READY (.+)$/.exec(line);
      if (!m) return;
      clearTimeout(timer);
      rl.removeAllListeners('line');
      try {
        resolve(JSON.parse(m[1]));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function awaitExit(proc: ReturnType<typeof spawn>, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`process did not exit within ${timeoutMs}ms`)), timeoutMs);
    proc.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe('server lifecycle', () => {
  it('emits MANUALFLOW_READY with an OS-assigned port when PORT=0', async () => {
    const { proc, rl } = spawnServer();
    try {
      const ready = await awaitReadyLine(rl, 10_000);
      expect(ready.port).toBeGreaterThan(0);
      expect(ready.port).toBeLessThan(65536);
      expect(ready.host).toBe('127.0.0.1');
    } finally {
      proc.kill('SIGTERM');
      await awaitExit(proc, 5_000).catch(() => proc.kill('SIGKILL'));
    }
  }, 30_000);

  it('exits cleanly on SIGTERM', async () => {
    const { proc, rl } = spawnServer();
    await awaitReadyLine(rl, 10_000);
    proc.kill('SIGTERM');
    const code = await awaitExit(proc, 5_000);
    expect(code).toBe(0);
  }, 30_000);
});
