import { spawn, execFile } from 'child_process';
import { EventEmitter } from 'events';
import type { GeteventLine, InputDeviceRange } from './types.js';

const LINE_REGEX = /\[\s*([\d.]+)\]\s+(\S+):\s+(\S+)\s+(\S+)\s+(\S+)/;

export function parseGeteventLine(line: string): GeteventLine | null {
  const match = LINE_REGEX.exec(line);
  if (!match) return null;

  const ts = parseFloat(match[1]);
  if (isNaN(ts)) return null;

  return {
    timestamp: ts,
    device: match[2],
    type: match[3],
    code: match[4],
    value: match[5],
  };
}

export async function discoverInputDevice(serial: string): Promise<InputDeviceRange> {
  return new Promise((resolve, reject) => {
    execFile('adb', ['-s', serial, 'shell', 'getevent', '-lp'], {
      maxBuffer: 1024 * 1024,
    }, (err, stdout) => {
      if (err) return reject(new Error(`Failed to discover input device: ${err.message}`));

      const deviceRegex = /add device \d+:\s+(\/dev\/input\/event\d+)/;
      const absRegex = /(ABS_MT_POSITION_[XY])\s*.*max\s+(\d+)/;

      let currentDevice: string | null = null;
      let hasPositionX = false;
      let maxX = 0;
      let maxY = 0;

      for (const line of stdout.split('\n')) {
        const deviceMatch = deviceRegex.exec(line);
        if (deviceMatch) {
          if (hasPositionX && currentDevice) {
            return resolve({ devicePath: currentDevice, maxX, maxY });
          }
          currentDevice = deviceMatch[1];
          hasPositionX = false;
          maxX = 0;
          maxY = 0;
          continue;
        }

        const absMatch = absRegex.exec(line);
        if (absMatch && currentDevice) {
          if (absMatch[1] === 'ABS_MT_POSITION_X') {
            hasPositionX = true;
            maxX = parseInt(absMatch[2]);
          } else {
            maxY = parseInt(absMatch[2]);
          }
        }
      }

      if (hasPositionX && currentDevice) {
        return resolve({ devicePath: currentDevice, maxX, maxY });
      }

      reject(new Error('No touchscreen input device found'));
    });
  });
}

export class GeteventStream extends EventEmitter {
  private process: ReturnType<typeof spawn> | null = null;

  constructor(
    private serial: string,
    private devicePath: string,
  ) {
    super();
  }

  start(): void {
    this.process = spawn('adb', [
      '-s', this.serial,
      'shell', 'getevent', '-lt', this.devicePath,
    ]);

    let buffer = '';

    this.process.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop()!;

      for (const line of lines) {
        const parsed = parseGeteventLine(line);
        if (parsed && parsed.device === this.devicePath) {
          this.emit('line', parsed);
        }
      }
    });

    this.process.on('close', (code) => {
      this.emit('close', code);
    });

    this.process.on('error', (err) => {
      this.emit('error', err);
    });
  }

  stop(): void {
    this.process?.kill();
    this.process = null;
  }
}
