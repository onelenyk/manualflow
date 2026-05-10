import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { startServer, stopServer, ServerHandle } from './serverProcess.js';
import { resolveBundledAdb } from './adbBridge.js';
import { detectMaestro, maestroInstallHint, type MaestroDetection } from './maestroDetect.js';

const isDev = process.env.MANUALFLOW_DEV === '1' || !app.isPackaged;
const VITE_DEV_URL = process.env.VITE_DEV_URL || 'http://localhost:5173';

let server: ServerHandle | null = null;
let win: BrowserWindow | null = null;
let maestroState: MaestroDetection = { installed: false, path: null, version: null };

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

function repoRoot(): string {
  // packages/electron is two levels under repo root.
  return path.resolve(app.getAppPath(), '..', '..');
}

function devServerEntry(): string {
  return path.resolve(repoRoot(), 'packages', 'server', 'src', 'index.ts');
}

async function startEmbeddedServer(): Promise<ServerHandle> {
  const root = repoRoot();
  const adb = resolveBundledAdb({
    devRoot: path.join(root, 'packages', 'electron'),
    resourcesPath: process.resourcesPath,
  });
  return startServer({
    serverEntry: devServerEntry(),
    dev: true,
    cwd: root,
    adbPath: adb.adbPath ?? undefined,
    onLog: (line, stream) => {
      // Surface server output in the Electron main console for debugging.
      // eslint-disable-next-line no-console
      const tag = stream === 'stderr' ? 'server.err' : 'server';
      console.log(`[${tag}] ${line}`);
    },
  });
}

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0f172a',
    title: 'ManualFlow',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (isDev) {
    await win.loadURL(VITE_DEV_URL);
  } else if (server) {
    await win.loadURL(server.httpBase);
  }
}

async function bootstrap(): Promise<void> {
  // Run Maestro detection in parallel with server startup — it's a non-blocking
  // status flag the UI surfaces.
  const maestroPromise = detectMaestro().catch(() => maestroState);

  try {
    server = await startEmbeddedServer();
  } catch (err) {
    dialog.showErrorBox('ManualFlow failed to start', (err as Error).message);
    app.quit();
    return;
  }

  maestroState = await maestroPromise;

  ipcMain.handle('manualflow:getApiBase', () => {
    if (!server) throw new Error('server not started');
    return { http: server.httpBase, ws: server.wsBase };
  });

  ipcMain.handle('manualflow:pickFolder', async (_e, opts: { prompt?: string; defaultPath?: string }) => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined;
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: opts?.defaultPath,
      title: opts?.prompt ?? 'Pick a folder',
    });
    return {
      canceled: result.canceled,
      path: result.filePaths[0] ?? null,
    };
  });

  ipcMain.handle('manualflow:openExternal', (_e, url: string) => shell.openExternal(url));

  ipcMain.handle('manualflow:getMaestroStatus', () => ({
    detection: maestroState,
    hint: maestroState.installed ? null : maestroInstallHint(process.platform),
  }));

  await createWindow();
}

let shuttingDown = false;
async function gracefulShutdown(reason: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`[main] shutdown reason=${reason}`);
  await stopServer(server).catch(() => {});
  server = null;
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', async () => {
  await gracefulShutdown('window-all-closed');
  app.quit();
});

app.on('before-quit', async (event) => {
  if (shuttingDown) return;
  event.preventDefault();
  await gracefulShutdown('before-quit');
  app.exit(0);
});

process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM').finally(() => app.exit(0));
});

process.on('SIGINT', () => {
  gracefulShutdown('SIGINT').finally(() => app.exit(0));
});
