// Runtime API base discovery.
//
// In packaged Electron mode the supervisor binds the server to an OS-assigned
// port and exposes the concrete URLs via the preload bridge. In Vite dev (or
// any browser without the preload) we fall back to relative URLs so Vite's
// /api and /ws proxies keep working unchanged.
//
// Plan reference: §6a surface boundary, §8 frontend changes.

interface ManualflowBridge {
  getApiBase: () => Promise<{ http: string; ws: string }>;
}

declare global {
  interface Window {
    manualflow?: ManualflowBridge;
  }
}

let apiBase = '/api';
let wsBase = '';

export async function configureApi(): Promise<void> {
  const bridge = typeof window !== 'undefined' ? window.manualflow : undefined;
  if (!bridge?.getApiBase) return;
  try {
    const { http, ws } = await bridge.getApiBase();
    apiBase = `${http.replace(/\/$/, '')}/api`;
    wsBase = ws.replace(/\/$/, '');
  } catch {
    // Keep relative defaults; the dashboard still works inside Electron because
    // the renderer's origin matches the server when loaded from http://127.0.0.1:<port>/.
  }
}

export function apiUrl(path: string): string {
  return `${apiBase}${path}`;
}

export function getWsUrl(path: string): string {
  if (wsBase) return `${wsBase}${path}`;
  if (typeof window !== 'undefined' && window.location) {
    return `ws://${window.location.host}${path}`;
  }
  return path;
}
