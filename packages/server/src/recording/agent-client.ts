import type { UiElement, DeviceInfo } from '@maestro-recorder/shared';
import http from 'http';
import { EventEmitter } from 'events';

export class AgentClient {
  private baseUrl: string;

  constructor(private port = 50051) {
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  async elementAt(x: number, y: number): Promise<UiElement | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.baseUrl}/element-at`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async deviceInfo(): Promise<DeviceInfo | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.baseUrl}/device-info`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async getTree(): Promise<any[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.baseUrl}/tree`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  /** Connect to agent's chunked event stream. Returns EventEmitter that fires 'event' */
  connectEventStream(): EventEmitter {
    const emitter = new EventEmitter();

    const req = http.get(`http://127.0.0.1:${this.port}/events/stream`, (res) => {
      let buffer = '';
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop()!;
        for (const line of lines) {
          if (line.trim()) {
            try {
              emitter.emit('event', JSON.parse(line));
            } catch {}
          }
        }
      });
      res.on('end', () => emitter.emit('end'));
      res.on('error', (err) => emitter.emit('error', err));
    });

    req.on('error', (err) => emitter.emit('error', err));

    // Store request for cleanup
    (emitter as any)._request = req;
    return emitter;
  }

  /** Disconnect the event stream */
  static disconnectEventStream(emitter: EventEmitter): void {
    const req = (emitter as any)._request;
    if (req) req.destroy();
  }

  async ping(): Promise<boolean> {
    const info = await this.deviceInfo();
    return info !== null;
  }
}
