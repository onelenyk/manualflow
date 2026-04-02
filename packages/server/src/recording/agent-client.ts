import type { UiElement, DeviceInfo } from '@maestro-recorder/shared';

export class AgentClient {
  private baseUrl: string;

  constructor(port = 50051) {
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

  async ping(): Promise<boolean> {
    const info = await this.deviceInfo();
    return info !== null;
  }
}
