import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { resolveBundledAdb } from './adbBridge.js';

const REPO_ELECTRON = path.resolve(__dirname, '..');

describe('resolveBundledAdb', () => {
  it('returns null when no candidate exists', () => {
    const result = resolveBundledAdb({
      devRoot: '/nonexistent/path/that/does/not/exist',
      resourcesPath: '/also/missing',
    });
    expect(result.adbPath).toBeNull();
    expect(result.pathPrefix).toBeNull();
  });

  it('finds the bundled adb under devRoot/resources/platform-tools/<arch>', () => {
    const archKey = `${process.platform}-${process.arch}`;
    const expected = path.join(
      REPO_ELECTRON,
      'resources',
      'platform-tools',
      archKey,
      process.platform === 'win32' ? 'adb.exe' : 'adb'
    );
    if (!fs.existsSync(expected)) {
      // Skip when the platform-tools fetch hasn't run for the host arch yet.
      return;
    }
    const result = resolveBundledAdb({ devRoot: REPO_ELECTRON });
    expect(result.adbPath).toBe(expected);
    expect(result.pathPrefix).toBe(path.dirname(expected));
  });

  it('honors an explicit override that exists', () => {
    const result = resolveBundledAdb({ override: __filename });
    expect(result.adbPath).toBe(__filename);
    expect(result.pathPrefix).toBe(path.dirname(__filename));
  });
});
