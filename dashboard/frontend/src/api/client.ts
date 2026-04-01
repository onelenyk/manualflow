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

  // Test Runner
  runFlow: (id: string) =>
    fetchJson<any>(`/flows/${id}/run`, { method: 'POST' }),
  stopRun: (runId: string) =>
    fetch(`${BASE_URL}/runs/${runId}/stop`, { method: 'POST' }),

  // YAML
  parseYaml: (yaml: string) =>
    fetchJson<any>('/yaml/parse', { method: 'POST', body: JSON.stringify({ yaml }) }),
  generateYaml: (appId: string, commands: any[]) =>
    fetchJson<any>('/yaml/generate', { method: 'POST', body: JSON.stringify({ appId, commands }) }),
};
