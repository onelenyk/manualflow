import type { Application } from 'express';
import type { AppState } from '../index.js';
import { spawn } from 'child_process';
import { createConnection } from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRCPY_JAR = path.resolve(__dirname, '../../../../scrcpy-server.jar');
const DEVICE_PATH = '/data/local/tmp/scrcpy-server.jar';
const SCRCPY_VERSION = '3.1';
const LOCAL_PORT = 27183;

function adbSpawn(serial: string, ...args: string[]) {
  return spawn('adb', ['-s', serial, ...args]);
}

function adbRun(serial: string, ...args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn('adb', ['-s', serial, ...args]);
    let out = '';
    p.stdout.on('data', (d: Buffer) => { out += d; });
    p.stderr.on('data', (d: Buffer) => { out += d; });
    p.on('close', (code) => code !== 0 ? reject(new Error(out)) : resolve(out.trim()));
  });
}

export function screenRoutes(app: Application, state: AppState) {
  (app as any).ws('/ws/mirror', async (ws: any, _req: any) => {
    const serial = state.activeDevice;
    if (!serial) {
      ws.send(JSON.stringify({ error: 'No device selected' }));
      ws.close();
      return;
    }

    try {
      // Push scrcpy-server
      if (!fs.existsSync(SCRCPY_JAR)) throw new Error('scrcpy-server.jar not found');
      await adbRun(serial, 'push', SCRCPY_JAR, DEVICE_PATH);
      await adbRun(serial, 'forward', `tcp:${LOCAL_PORT}`, 'localabstract:scrcpy');

      // Start scrcpy server (no frame meta — raw H.264 Annex B stream)
      const serverProc = adbSpawn(serial,
        'shell', `CLASSPATH=${DEVICE_PATH}`,
        'app_process', '/', 'com.genymobile.scrcpy.Server', SCRCPY_VERSION,
        'tunnel_forward=true', 'video=true', 'audio=false', 'control=true',
        'max_size=1024', 'video_bit_rate=4000000', 'max_fps=30',
        'video_codec=h264', 'send_frame_meta=false',
      );

      await new Promise(r => setTimeout(r, 1500));

      // Connect sockets (video first, then control)
      const videoSocket = createConnection(LOCAL_PORT, '127.0.0.1');
      videoSocket.setNoDelay(true);
      const controlSocket = createConnection(LOCAL_PORT, '127.0.0.1');
      controlSocket.setNoDelay(true);

      // Read 64-byte device name (dummy byte + 63 bytes name, or 64 bytes name depending on version)
      let initBuf = Buffer.alloc(0);
      const deviceName = await new Promise<string>((resolve) => {
        const onData = (chunk: Buffer) => {
          initBuf = Buffer.concat([initBuf, chunk]);
          if (initBuf.length >= 64) {
            videoSocket.removeListener('data', onData);
            // Find null terminator or take first 64 bytes
            const nameEnd = initBuf.indexOf(0);
            const name = initBuf.subarray(0, nameEnd > 0 ? nameEnd : 64).toString('utf8');
            resolve(name);
            // Re-emit remaining H.264 data
            const remaining = initBuf.subarray(64);
            if (remaining.length > 0) videoSocket.emit('data', remaining);
          }
        };
        videoSocket.on('data', onData);
      });

      // Get screen size
      const sizeOut = await adbRun(serial, 'shell', 'wm', 'size');
      const sm = sizeOut.match(/(\d+)x(\d+)/);
      const w = sm ? parseInt(sm[1]) : 1080;
      const h = sm ? parseInt(sm[2]) : 1920;

      // Send device info as first message
      ws.send(JSON.stringify({ device: deviceName, width: w, height: h }));

      // Video → WebSocket (channel 0)
      videoSocket.on('data', (chunk: Buffer) => {
        if (ws.readyState !== 1) return;
        const msg = Buffer.alloc(4 + chunk.length);
        msg.writeInt32BE(0, 0);
        chunk.copy(msg, 4);
        ws.send(msg);
      });

      // Control responses → WebSocket (channel 1)
      controlSocket.on('data', (chunk: Buffer) => {
        if (ws.readyState !== 1) return;
        const msg = Buffer.alloc(4 + chunk.length);
        msg.writeInt32BE(1, 0);
        chunk.copy(msg, 4);
        ws.send(msg);
      });

      // WebSocket → control
      ws.on('message', (data: Buffer) => {
        if (!(data instanceof Buffer) || data.length < 4) return;
        if (data.readInt32BE(0) === 1) controlSocket.write(data.subarray(4));
      });

      const cleanup = () => {
        videoSocket.destroy();
        controlSocket.destroy();
        serverProc.kill();
        adbRun(serial, 'forward', '--remove', `tcp:${LOCAL_PORT}`).catch(() => {});
      };

      ws.on('close', cleanup);
      ws.on('error', cleanup);
      videoSocket.on('error', cleanup);
    } catch (e: any) {
      ws.send(JSON.stringify({ error: e.message }));
      ws.close();
    }
  });
}
