const BASE_URL = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${url}`, {
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
  launchMirror: (serial: string) => fetchJson<any>(`/devices/${serial}/mirror`, { method: 'POST' }),
  stopMirror: (serial: string) => fetchJson<any>(`/devices/${serial}/mirror/stop`, { method: 'POST' }),
  getMirrorStatus: (serial: string) => fetchJson<any>(`/devices/${serial}/mirror/status`),
  screenshotUrl: (serial: string) => `/api/devices/${serial}/screenshot?t=${Date.now()}`,
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
    fetch(`${BASE_URL}/flows/${id}`, { method: 'DELETE' }),
  duplicateFlow: (id: string, newName: string) =>
    fetchJson<any>(`/flows/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ name: newName }) }),

  // Maestro
  getMaestroStatus: () => fetchJson<any>('/maestro/status'),

  // Test Runner
  startRun: (flowId: string, deviceSerial?: string) =>
    fetchJson<any>('/runs', { method: 'POST', body: JSON.stringify({ flowId, deviceSerial }) }),
  listRuns: () => fetchJson<any[]>('/runs'),
  getRun: (runId: string) => fetchJson<any>(`/runs/${runId}`),
  stopRun: (runId: string) =>
    fetch(`${BASE_URL}/runs/${runId}`, { method: 'DELETE' }),
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
};
