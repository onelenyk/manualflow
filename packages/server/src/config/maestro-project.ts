import fs from 'fs';
import os from 'os';
import path from 'path';

export interface MaestroProjectConfig {
  current: string | null;
  recents: string[];
}

const CONFIG_DIR = path.join(os.homedir(), '.manualflow');
const CONFIG_FILE = path.join(CONFIG_DIR, 'maestro-project.json');

const MAX_RECENTS = 10;

interface StoredConfig {
  current: string | null;
  recents: string[];
  savedAt?: string;
}

function loadStoredConfig(): StoredConfig | null {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoredConfig;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getMaestroProjectConfig(): MaestroProjectConfig {
  const stored = loadStoredConfig();
  if (!stored) {
    return { current: null, recents: [] };
  }
  return {
    current: typeof stored.current === 'string' ? stored.current : null,
    recents: Array.isArray(stored.recents) ? stored.recents.filter(r => typeof r === 'string') : [],
  };
}

export function saveMaestroProjectConfig(input: { current: string | null; recents: string[] }): MaestroProjectConfig {
  const current = typeof input.current === 'string' ? input.current : null;

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const r of input.recents) {
    if (typeof r === 'string' && !seen.has(r)) {
      seen.add(r);
      deduped.push(r);
      if (deduped.length >= MAX_RECENTS) break;
    }
  }

  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const stored: StoredConfig = { current, recents: deduped, savedAt: new Date().toISOString() };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(stored, null, 2), { mode: 0o600 });

  return { current, recents: deduped };
}
