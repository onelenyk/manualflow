import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { startServer, stopServer } from './serverProcess.js';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SERVER_ENTRY = path.resolve(REPO_ROOT, 'packages', 'server', 'src', 'index.ts');

describe('electron supervisor', () => {
  it('spawns the server child via tsx in dev mode and parses MANUALFLOW_READY', async () => {
    const handle = await startServer({
      serverEntry: SERVER_ENTRY,
      dev: true,
      cwd: REPO_ROOT,
      readyTimeoutMs: 10_000,
    });
    try {
      expect(handle.port).toBeGreaterThan(0);
      expect(handle.port).toBeLessThan(65536);
      expect(handle.host).toBe('127.0.0.1');
      expect(handle.httpBase).toBe(`http://127.0.0.1:${handle.port}`);
      expect(handle.wsBase).toBe(`ws://127.0.0.1:${handle.port}`);
    } finally {
      await stopServer(handle, 5000);
    }
  }, 30_000);
});
