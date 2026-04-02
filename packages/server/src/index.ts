import express from 'express';
import cors from 'cors';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { deviceRoutes } from './routes/devices.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '2344', 10);

const app = express();
app.use(cors());
app.use(express.json());

export function adbExec(...args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('adb', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`adb ${args.join(' ')} failed: ${stderr || err.message}`));
      else resolve(stdout.trim());
    });
  });
}

export interface AppState {
  activeDevice: string | null;
  scrcpyProcess: import('child_process').ChildProcess | null;
}

const state: AppState = { activeDevice: null, scrcpyProcess: null };

app.get('/health', (_req, res) => res.send('OK'));
app.use('/api', deviceRoutes(state));

const frontendDist = path.resolve(__dirname, '../../../dashboard/frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MaestroRecorder dashboard: http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  state.scrcpyProcess?.kill();
  process.exit(0);
});
