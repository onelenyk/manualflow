import { Router } from 'express';
import { execFile } from 'child_process';
import os from 'os';

function pickFolderMac(prompt: string, defaultPath?: string): Promise<string | null> {
  const escaped = prompt.replace(/"/g, '\\"');
  let script = `POSIX path of (choose folder with prompt "${escaped}"`;
  if (defaultPath) {
    const escDefault = defaultPath.replace(/"/g, '\\"');
    script += ` default location "${escDefault}"`;
  }
  script += `)`;

  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: 5 * 60 * 1000 }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || err.message || '').toString();
        if (/User canceled/i.test(msg)) {
          return resolve(null);
        }
        return reject(new Error(msg.trim() || 'osascript failed'));
      }
      const picked = stdout.trim().replace(/\/$/, '');
      resolve(picked || null);
    });
  });
}

export function systemRoutes(): Router {
  const router = Router();

  router.post('/system/pick-folder', async (req, res) => {
    const { prompt, defaultPath } = (req.body || {}) as { prompt?: string; defaultPath?: string };
    const title = typeof prompt === 'string' && prompt.trim() ? prompt.trim() : 'Select folder';

    if (os.platform() !== 'darwin') {
      return res.status(501).json({ error: 'native-folder-picker-unsupported', platform: os.platform() });
    }

    try {
      const picked = await pickFolderMac(title, defaultPath);
      if (picked === null) return res.json({ canceled: true, path: null });
      res.json({ canceled: false, path: picked });
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: 'pick-folder-failed', details });
    }
  });

  return router;
}
