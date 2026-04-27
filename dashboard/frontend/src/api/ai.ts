import type { EnhancementResult, RecordedInteraction } from '@maestro-recorder/shared';

async function fetchEnhancement(endpoint: string, body: object): Promise<EnhancementResult> {
  const response = await fetch(`/api/ai/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || error.details || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function enhanceFlow(yaml: string): Promise<EnhancementResult> {
  return fetchEnhancement('enhance-flow', { yaml });
}

export async function enhanceFromInteractions(interactions: RecordedInteraction[]): Promise<EnhancementResult> {
  return fetchEnhancement('enhance-interactions', { interactions });
}

export type AiConfigSource = 'stored' | 'env' | null;

export interface AiStatus {
  configured: boolean;
  model: string | null;
  source: AiConfigSource;
  missing: string[];
}

export async function getAiStatus(): Promise<AiStatus> {
  const response = await fetch('/api/ai/status');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function saveAiConfig(input: { apiKey: string; model?: string }): Promise<AiStatus> {
  const response = await fetch('/api/ai/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body.status as AiStatus;
}

export async function clearAiConfig(): Promise<AiStatus> {
  const response = await fetch('/api/ai/config', { method: 'DELETE' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body.status as AiStatus;
}
