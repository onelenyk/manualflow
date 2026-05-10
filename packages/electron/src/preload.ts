import { contextBridge, ipcRenderer } from 'electron';

interface ApiBase {
  http: string;
  ws: string;
}

contextBridge.exposeInMainWorld('manualflow', {
  getApiBase: (): Promise<ApiBase> => ipcRenderer.invoke('manualflow:getApiBase'),
  pickFolder: (opts: { prompt?: string; defaultPath?: string }) =>
    ipcRenderer.invoke('manualflow:pickFolder', opts),
  openExternal: (url: string) => ipcRenderer.invoke('manualflow:openExternal', url),
  platform: () => process.platform,
});
