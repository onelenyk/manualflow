import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { startServer, stopServer, ServerHandle } from './serverProcess.js';
import { resolveBundledAdb } from './adbBridge.js';
import { detectMaestro, maestroInstallHint, type MaestroDetection } from './maestroDetect.js';
import { maybePromptForMaestroProject } from './firstRun.js';

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

function packagedServerEntry(): string {
  return path.join(process.resourcesPath, 'server-pack', 'dist', 'index.js');
}

function packagedStaticDir(): string {
  return path.join(process.resourcesPath, 'server-pack', 'static');
}

function packagedAgentApk(): string {
  return path.join(process.resourcesPath, 'server-pack', 'agent', 'agent-debug-androidTest.apk');
}

function devServerEntry(): string {
  return path.resolve(repoRoot(), 'packages', 'server', 'src', 'index.ts');
}

function logServerLine(line: string, stream: 'stdout' | 'stderr'): void {
  const tag = stream === 'stderr' ? 'server.err' : 'server';
  // eslint-disable-next-line no-console
  console.log(`[${tag}] ${line}`);
}

async function startEmbeddedServer(): Promise<ServerHandle> {
  const root = repoRoot();
  const adb = resolveBundledAdb({
    devRoot: path.join(root, 'packages', 'electron'),
    resourcesPath: process.resourcesPath,
  });
  if (isDev) {
    return startServer({
      serverEntry: devServerEntry(),
      dev: true,
      cwd: root,
      adbPath: adb.adbPath ?? undefined,
      onLog: logServerLine,
    });
  }

  // Packaged: spawn the tsc-built CJS via Electron's bundled Node runtime.
  return startServer({
    serverEntry: packagedServerEntry(),
    dev: false,
    cwd: path.join(process.resourcesPath, 'server-pack'),
    adbPath: adb.adbPath ?? undefined,
    staticDir: packagedStaticDir(),
    extraEnv: { MANUALFLOW_AGENT_APK: packagedAgentApk() },
    onLog: logServerLine,
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
    const focused = BrowserWindow.getFocusedWindow();
    const dialogOptions: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: opts?.defaultPath,
      title: opts?.prompt ?? 'Pick a folder',
    };
    const result = focused
      ? await dialog.showOpenDialog(focused, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
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

  // First-run UX: if no Maestro project is configured, ask the user where
  // their flows live. Non-blocking — the dashboard still loads either way.
  if (server) {
    maybePromptForMaestroProject({ httpBase: server.httpBase, parentWindow: win ?? undefined })
      // eslint-disable-next-line no-console
      .catch((e) => console.warn('[main] first-run prompt failed:', e));
  }
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
