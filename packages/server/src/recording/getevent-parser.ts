import { spawn, execFile } from 'child_process';
import { EventEmitter } from 'events';
import type { GeteventLine, InputDeviceRange } from './types.js';

// Format with device path: [timestamp] /dev/input/event3: EV_KEY BTN_TOUCH DOWN
const LINE_REGEX_FULL = /\[\s*([\d.]+)\]\s+(\/dev\/\S+):\s+(\S+)\s+(\S+)\s+(\S+)/;
// Format without device path (single device mode): [timestamp] EV_KEY BTN_TOUCH DOWN
const LINE_REGEX_SHORT = /\[\s*([\d.]+)\]\s+(\S+)\s+(\S+)\s+(\S+)/;

export function parseGeteventLine(line: string, devicePath?: string): GeteventLine | null {
  // Try full format first
  const fullMatch = LINE_REGEX_FULL.exec(line);
  if (fullMatch) {
    const ts = parseFloat(fullMatch[1]);
    if (isNaN(ts)) return null;
    return { timestamp: ts, device: fullMatch[2], type: fullMatch[3], code: fullMatch[4], value: fullMatch[5] };
  }

  // Try short format (no device path)
  const shortMatch = LINE_REGEX_SHORT.exec(line);
  if (shortMatch) {
    const ts = parseFloat(shortMatch[1]);
    if (isNaN(ts)) return null;
    return { timestamp: ts, device: devicePath || 'unknown', type: shortMatch[2], code: shortMatch[3], value: shortMatch[4] };
  }

  return null;
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
        const parsed = parseGeteventLine(line, this.devicePath);
        if (parsed) {
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
