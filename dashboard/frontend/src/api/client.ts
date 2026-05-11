import type { MaestroProject } from '@maestro-recorder/shared';
import { apiUrl } from './config';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(url), {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || response.statusText);
  }
  return response.json();
}

export const api = {
  // Devices
  getDevices: () => fetchJson<any[]>('/devices'),
  getDeviceInfo: (serial: string) => fetchJson<any>(`/devices/${serial}/info`),
  selectDevice: (serial: string) => fetchJson<any>(`/devices/${serial}/select`, { method: 'POST' }),
  listApps: (serial: string) => fetchJson<{ apps: string[] }>(`/devices/${serial}/apps`),
  launchMirror: (serial: string) => fetchJson<any>(`/devices/${serial}/mirror`, { method: 'POST' }),
  stopMirror: (serial: string) => fetchJson<any>(`/devices/${serial}/mirror/stop`, { method: 'POST' }),
  getMirrorStatus: (serial: string) => fetchJson<any>(`/devices/${serial}/mirror/status`),
  screenshotUrl: (serial: string) => apiUrl(`/devices/${serial}/screenshot?t=${Date.now()}`),
  getDeviceSettings: (serial: string) => fetchJson<Record<string, boolean>>(`/devices/${serial}/settings`),
  setDeviceSetting: (serial: string, key: string, value: boolean) =>
    fetchJson<any>(`/devices/${serial}/settings`, { method: 'POST', body: JSON.stringify({ key, value }) }),

  // Recording
  startRecording: (body: { deviceSerial?: string; appId?: string }) =>
    fetchJson<any>('/recording/start', { method: 'POST', body: JSON.stringify(body) }),
  stopRecording: () =>
    fetchJson<any>('/recording/stop', { method: 'POST' }),
  getRecordingStatus: () =>
    fetchJson<any>('/recording/status'),

  // Flows
  getFlows: () => fetchJson<any[]>('/flows'),
  getFlow: (id: string) => fetchJson<any>(`/flows/${id}`),
  saveFlow: (body: { name: string; yaml: string }) =>
    fetchJson<any>('/flows', { method: 'POST', body: JSON.stringify(body) }),
  updateFlow: (id: string, body: { name?: string; yaml?: string }) =>
    fetchJson<any>(`/flows/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteFlow: (id: string) =>
    fetch(apiUrl(`/flows/${id}`), { method: 'DELETE' }),
  duplicateFlow: (id: string, newName: string) =>
    fetchJson<any>(`/flows/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ name: newName }) }),

  // System
  pickFolder: (opts?: { prompt?: string; defaultPath?: string }) =>
    fetchJson<{ canceled: boolean; path: string | null }>('/system/pick-folder', {
      method: 'POST',
      body: JSON.stringify(opts ?? {}),
    }),

  // Maestro
  getMaestroStatus: () => fetchJson<any>('/maestro/status'),

  // Maestro Project
  getMaestroProject: () => fetchJson<{ project: MaestroProject | null; recents: string[] }>('/maestro/project'),
  openMaestroProject: (folderPath: string) =>
    fetchJson<MaestroProject>('/maestro/project', { method: 'POST', body: JSON.stringify({ folderPath }) }),
  getMaestroFlow: (path: string) =>
    fetchJson<{ yaml: string; sha: string; draft: { yaml: string; sha: string } | null }>(
      `/maestro/flow?path=${encodeURIComponent(path)}`
    ),
  saveMaestroFlow: (body: { path: string; yaml: string; expectedSha?: string; overwrite?: boolean }) =>
    fetchJson<{ path: string; sha: string }>('/maestro/flow', { method: 'POST', body: JSON.stringify(body) }),
  putMaestroDraft: (path: string, yaml: string) =>
    fetchJson<{ draftPath: string; sha: string }>('/maestro/draft', { method: 'PUT', body: JSON.stringify({ path, yaml }) }),
  deleteMaestroDraft: (path: string) =>
    fetchJson<{ ok: true }>(`/maestro/draft?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
  startMaestroRun: (flowPath: string, deviceSerial?: string) =>
    fetchJson<any>('/maestro/runs', { method: 'POST', body: JSON.stringify({ flowPath, deviceSerial }) }),

  // Maestro AI flow ops
  aiPrettifyFlow: (yaml: string) =>
    fetchJson<{ yaml: string; changesSummary: string }>('/ai/flow/prettify', {
      method: 'POST',
      body: JSON.stringify({ yaml }),
    }),
  aiVerifyYaml: (yaml: string) =>
    fetchJson<{ ok: boolean; errors: { line?: number; col?: number; message: string; code: string }[]; warnings: string[] }>(
      '/ai/flow/verify-yaml',
      { method: 'POST', body: JSON.stringify({ yaml }) }
    ),
  aiVerifyFlow: (yaml: string) =>
    fetchJson<{
      deterministic: { ok: boolean; errors: { line?: number; col?: number; message: string; code: string }[]; warnings: string[] };
      semantic: { ok: boolean; notes: string[]; suggestions: string[] } | null;
    }>('/ai/flow/verify-flow', { method: 'POST', body: JSON.stringify({ yaml }) }),
  aiExtractCommon: (flows: { path: string; yaml: string }[]) =>
    fetchJson<{
      subflows: { name: string; yaml: string; sourceFlows: string[] }[];
      refactors: { flowPath: string; before: string; after: string; reason: string }[];
    }>('/ai/flow/extract-common', { method: 'POST', body: JSON.stringify({ flows }) }),
  aiCreateFromPrompt: (body: { prompt: string; appId?: string; exampleFlows?: string[] }) =>
    fetchJson<{ relativePath: string; draftPath: string; yaml: string; appIdUsed: string }>(
      '/ai/flow/create-from-prompt',
      { method: 'POST', body: JSON.stringify(body) }
    ),

  // Test Runner
  startRun: (flowId: string, deviceSerial?: string) =>
    fetchJson<any>('/runs', { method: 'POST', body: JSON.stringify({ flowId, deviceSerial }) }),
  listRuns: () => fetchJson<any[]>('/runs'),
  getRun: (runId: string) => fetchJson<any>(`/runs/${runId}`),
  stopRun: (runId: string) =>
    fetch(apiUrl(`/runs/${runId}`), { method: 'DELETE' }),
  pauseRun: (runId: string) =>
    fetchJson<any>(`/runs/${runId}/pause`, { method: 'POST' }),
  resumeRun: (runId: string) =>
    fetchJson<any>(`/runs/${runId}/resume`, { method: 'POST' }),

  // YAML
  parseYaml: (yaml: string) =>
    fetchJson<any>('/yaml/parse', { method: 'POST', body: JSON.stringify({ yaml }) }),
  validateYaml: (yaml: string) =>
    fetchJson<any>('/yaml/validate', { method: 'POST', body: JSON.stringify({ yaml }) }),
  generateYaml: (appId: string, commands: any[]) =>
    fetchJson<any>('/yaml/generate', { method: 'POST', body: JSON.stringify({ appId, commands }) }),

  // Templates
  getTemplates: () => fetchJson<any[]>('/templates'),
  getTemplate: (id: string) => fetchJson<any>(`/templates/${id}`),

  // Agent
  getAgentStatus: () => fetchJson<any>('/agent/status'),
  installAgent: () => fetchJson<any>('/agent/install', { method: 'POST' }),
  uninstallAgent: () => fetchJson<any>('/agent/uninstall', { method: 'POST' }),
  startAgent: () => fetchJson<any>('/agent/start', { method: 'POST' }),
  stopAgent: () => fetchJson<any>('/agent/stop', { method: 'POST' }),
  buildAgent: () => fetchJson<any>('/agent/build', { method: 'POST' }),

  // Stream
  getStreamStatus: () => fetchJson<{ connected: boolean; device: string | null; interactionCount: number }>('/stream/status'),
  reconnectStream: () => fetchJson<any>('/stream/reconnect', { method: 'POST' }),
};
