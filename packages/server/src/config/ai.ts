import fs from 'fs';
import os from 'os';
import path from 'path';

export interface AiConfig {
  apiKey: string;
  model: string;
}

export type ConfigSource = 'stored' | 'env' | null;

const DEFAULT_MODEL = 'anthropic/claude-3.5-sonnet';
const CONFIG_DIR = path.join(os.homedir(), '.manualflow');
const CONFIG_FILE = path.join(CONFIG_DIR, 'ai.json');

let cachedConfig: AiConfig | null = null;
let cachedSource: ConfigSource = null;

interface StoredConfig {
  apiKey: string;
  model?: string;
  savedAt?: string;
}

function loadStoredConfig(): StoredConfig | null {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoredConfig;
    if (!parsed.apiKey || typeof parsed.apiKey !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function resolveConfig(): { config: AiConfig; source: ConfigSource } | null {
  const stored = loadStoredConfig();
  if (stored) {
    const model = (stored.model && stored.model.trim()) || DEFAULT_MODEL;
    return { config: { apiKey: stored.apiKey, model }, source: 'stored' };
  }
  const envKey = process.env.OPENROUTER_API_KEY;
  if (envKey) {
    const model = (process.env.OPENROUTER_MODEL && process.env.OPENROUTER_MODEL.trim()) || DEFAULT_MODEL;
    return { config: { apiKey: envKey, model }, source: 'env' };
  }
  return null;
}

export function getOpenRouterConfig(): AiConfig {
  if (cachedConfig) return cachedConfig;
  const resolved = resolveConfig();
  if (!resolved) {
    throw new Error('OPENROUTER_API_KEY is not set. Save it via the dashboard AI step or set the environment variable.');
  }
  if (!resolved.config.model.trim()) {
    throw new Error('OPENROUTER_MODEL cannot be empty');
  }
  cachedConfig = resolved.config;
  cachedSource = resolved.source;
  return cachedConfig;
}

export function clearConfigCache(): void {
  cachedConfig = null;
  cachedSource = null;
}

export interface OpenRouterStatus {
  configured: boolean;
  model: string | null;
  source: ConfigSource;
  missing: string[];
}

/**
 * Non-throwing status probe for the dashboard. Reports whether the OpenRouter
 * config is present (via env or stored file) without revealing the key.
 */
export function getOpenRouterStatus(): OpenRouterStatus {
  const resolved = resolveConfig();
  if (!resolved) {
    return { configured: false, model: null, source: null, missing: ['OPENROUTER_API_KEY'] };
  }
  return {
    configured: true,
    model: resolved.config.model,
    source: resolved.source,
    missing: [],
  };
}

export interface SaveResult {
  ok: true;
  status: OpenRouterStatus;
}

/**
 * Persist an OpenRouter config to ~/.manualflow/ai.json (mode 0600).
 * Stored config wins over env vars; clear it via clearStoredConfig().
 */
export function saveStoredConfig(input: { apiKey: string; model?: string }): SaveResult {
  const apiKey = (input.apiKey || '').trim();
  if (!apiKey) throw new Error('apiKey is required');
  if (apiKey.length < 10) throw new Error('apiKey looks too short');
  if (/\s/.test(apiKey)) throw new Error('apiKey must not contain whitespace');
  const model = (input.model && input.model.trim()) || DEFAULT_MODEL;

  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const stored: StoredConfig = { apiKey, model, savedAt: new Date().toISOString() };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(stored, null, 2), { mode: 0o600 });

  clearConfigCache();
  return { ok: true, status: getOpenRouterStatus() };
}

export function clearStoredConfig(): { ok: true; status: OpenRouterStatus } {
  try { fs.unlinkSync(CONFIG_FILE); } catch {}
  clearConfigCache();
  return { ok: true, status: getOpenRouterStatus() };
}
