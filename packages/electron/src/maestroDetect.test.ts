import { describe, it, expect } from 'vitest';
import { maestroInstallHint, detectMaestro } from './maestroDetect.js';

describe('maestroInstallHint', () => {
  it('returns a brew command on darwin', () => {
    const hint = maestroInstallHint('darwin');
    expect(hint.command).toMatch(/brew/);
    expect(hint.url).toMatch(/^https?:\/\//);
  });

  it('returns a curl command on linux', () => {
    const hint = maestroInstallHint('linux');
    expect(hint.command).toMatch(/curl/);
  });

  it('returns a sane string for unknown platforms', () => {
    const hint = maestroInstallHint('aix' as NodeJS.Platform);
    expect(typeof hint.command).toBe('string');
    expect(hint.command.length).toBeGreaterThan(0);
  });
});

describe('detectMaestro', () => {
  it('returns a structured result regardless of host state', async () => {
    const r = await detectMaestro();
    expect(typeof r.installed).toBe('boolean');
    expect(r.path === null || typeof r.path === 'string').toBe(true);
    expect(r.version === null || typeof r.version === 'string').toBe(true);
    if (r.installed) expect(r.path).toBeTruthy();
  });
});
