import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { assertExistingPath, assertCreatePath } from './path-guard.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-guard-test-'));
  fs.mkdirSync(path.join(tmpDir, 'flows'));
  fs.writeFileSync(path.join(tmpDir, 'flows', 'test.yaml'), 'appId: com.example');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('assertExistingPath', () => {
  it('rejects ../../etc/passwd style traversal', () => {
    const target = path.join(tmpDir, 'flows', '..', '..', '..', 'etc', 'passwd');
    expect(() => assertExistingPath(tmpDir, target)).toThrow();
    try {
      assertExistingPath(tmpDir, target);
    } catch (e: any) {
      expect(e.code).toBe('PATH_GUARD');
      expect(e.message).not.toContain('passwd');
      expect(e.message).not.toContain('/etc');
    }
  });

  it('rejects absolute path outside root (/etc/passwd)', () => {
    expect(() => assertExistingPath(tmpDir, '/etc/passwd')).toThrow();
    try {
      assertExistingPath(tmpDir, '/etc/passwd');
    } catch (e: any) {
      expect(e.code).toBe('PATH_GUARD');
      expect(e.message).not.toContain('/etc/passwd');
    }
  });

  it('rejects flows/../../../etc/passwd traversal', () => {
    const target = path.join(tmpDir, 'flows', '..', '..', '..', 'etc', 'passwd');
    expect(() => assertExistingPath(tmpDir, target)).toThrow();
    try {
      assertExistingPath(tmpDir, target);
    } catch (e: any) {
      expect(e.code).toBe('PATH_GUARD');
    }
  });

  it('accepts a valid existing file inside root', () => {
    const target = path.join(tmpDir, 'flows', 'test.yaml');
    const result = assertExistingPath(tmpDir, target);
    expect(result).toBe(fs.realpathSync(target));
  });

  it('error messages do not include the candidate path', () => {
    const target = path.join(tmpDir, 'flows', '..', '..', 'secret');
    try {
      assertExistingPath(tmpDir, target);
    } catch (e: any) {
      expect(e.message).not.toContain('secret');
      expect(e.message).not.toContain(tmpDir);
    }
  });
});

describe('assertCreatePath', () => {
  it('rejects path with NUL byte in filename', () => {
    const target = path.join(tmpDir, 'flows\x00.yaml');
    expect(() => assertCreatePath(tmpDir, target)).toThrow();
    try {
      assertCreatePath(tmpDir, target);
    } catch (e: any) {
      expect(e.code).toBe('PATH_GUARD');
    }
  });

  it('accepts valid create target inside root', () => {
    const target = path.join(tmpDir, 'flows', 'new-flow.yaml');
    const result = assertCreatePath(tmpDir, target);
    expect(result).toContain('new-flow.yaml');
    expect(result.startsWith(fs.realpathSync(tmpDir))).toBe(true);
  });

  it('rejects create target that resolves outside root', () => {
    const target = path.join(tmpDir, '..', 'outside.yaml');
    expect(() => assertCreatePath(tmpDir, target)).toThrow();
    try {
      assertCreatePath(tmpDir, target);
    } catch (e: any) {
      expect(e.code).toBe('PATH_GUARD');
    }
  });

  it('rejects create target with symlinked parent directory', () => {
    const realSubdir = path.join(tmpDir, 'real-flows');
    fs.mkdirSync(realSubdir);
    const symlinkDir = path.join(tmpDir, 'sym-flows');
    fs.symlinkSync(realSubdir, symlinkDir);

    const target = path.join(symlinkDir, 'new-flow.yaml');
    expect(() => assertCreatePath(tmpDir, target)).toThrow();
    try {
      assertCreatePath(tmpDir, target);
    } catch (e: any) {
      expect(e.code).toBe('PATH_GUARD');
    }
  });

  it('error messages do not include the candidate path', () => {
    const target = path.join(tmpDir, '..', 'outside.yaml');
    try {
      assertCreatePath(tmpDir, target);
    } catch (e: any) {
      expect(e.message).not.toContain('outside.yaml');
      expect(e.message).not.toContain(tmpDir);
    }
  });
});
