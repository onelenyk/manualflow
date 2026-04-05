import { EventEmitter } from 'events';
import { execFile } from 'child_process';
import type { RecordedInteraction, AccessibilityEventData, UiElement, UserAction } from '@maestro-recorder/shared';
import { GeteventStream, discoverInputDevice } from '../recording/getevent-parser.js';
import { TouchStateMachine } from '../recording/touch-state-machine.js';
import { CoordinateConverter } from '../recording/coordinate-converter.js';
import { AgentClient } from '../recording/agent-client.js';
import { InteractionCollector } from '../recording/interaction-collector.js';
import type { GeteventLine } from '../recording/types.js';

const MAX_INTERACTIONS = 500;
const KEYBOARD_POLL_MS = 2000;
const RECONNECT_DELAY_MS = 3000;

/**
 * Always-on device data stream.
 * Runs getevent, accessibility events, keyboard polling continuously
 * as long as device + agent are connected.
 *
 * Produces RecordedInteraction objects in a ring buffer.
 *
 * Emits:
 *  - 'interaction:created'  (RecordedInteraction)
 *  - 'interaction:updated'  (RecordedInteraction)
 *  - 'interaction:complete' (RecordedInteraction)
 *  - 'raw'                  (GeteventLine)
 *  - 'connected'            ()
 *  - 'disconnected'         ()
 *  - 'error'                (string)
 */
export class DeviceStream extends EventEmitter {
  private serial: string | null = null;
  private agentPort = 50051;

  private geteventStream: GeteventStream | null = null;
  private touchStateMachine = new TouchStateMachine();
  private converter: CoordinateConverter | null = null;
  private agent: AgentClient | null = null;
  private collector: InteractionCollector | null = null;
  private agentEventStream: EventEmitter | null = null;
  private keyboardPollTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  private _interactions: RecordedInteraction[] = [];
  private _connected = false;
  private prefetchedElement: UiElement | null = null;
  private prefetchCoords: { x: number; y: number } | null = null;

  get connected(): boolean { return this._connected; }
  get interactions(): RecordedInteraction[] { return this._interactions; }
  get deviceSerial(): string | null { return this.serial; }

  /** Connect to a device and start all data streams */
  async connect(serial: string, agentPort = 50051): Promise<void> {
    // Disconnect existing if any
    if (this._connected) {
      this.disconnect();
    }

    this.serial = serial;
    this.agentPort = agentPort;
    this.agent = new AgentClient(agentPort);

    // 1. Port forwarding
    await this.adbExec('forward', `tcp:${agentPort}`, `tcp:${agentPort}`);

    // 2. Check agent
    const alive = await this.agent.ping();
    if (!alive) {
      throw new Error('Agent not responsive');
    }

    // 3. Device info
    let deviceInfo = await this.agent.deviceInfo();
    if (!deviceInfo) {
      const sizeOutput = await this.adbExec('shell', 'wm', 'size');
      const m = sizeOutput.match(/(\d+)x(\d+)/);
      deviceInfo = {
        screenWidth: m ? parseInt(m[1]) : 1080,
        screenHeight: m ? parseInt(m[2]) : 1920,
        density: 420,
      };
    }

    // 4. Input device discovery
    const inputDevice = await discoverInputDevice(serial);

    // 5. Coordinate converter
    this.converter = new CoordinateConverter(
      inputDevice.maxX, inputDevice.maxY,
      deviceInfo.screenWidth, deviceInfo.screenHeight,
    );

    // 6. InteractionCollector
    this.collector = new InteractionCollector(this.agent, deviceInfo.screenWidth, deviceInfo.screenHeight);

    this.collector.on('interaction:created', (i: RecordedInteraction) => {
      this.emit('interaction:created', i);
    });
    this.collector.on('interaction:updated', (i: RecordedInteraction) => {
      this.emit('interaction:updated', i);
    });
    this.collector.on('interaction:complete', (i: RecordedInteraction) => {
      this._interactions.push(i);
      // Ring buffer: trim old interactions
      if (this._interactions.length > MAX_INTERACTIONS) {
        this._interactions = this._interactions.slice(-MAX_INTERACTIONS);
      }
      this.emit('interaction:complete', i);
    });

    // 7. Getevent stream
    this.touchStateMachine = new TouchStateMachine();

    // Pre-fetch element on touch-down (before finger lifts and triggers navigation)
    this.touchStateMachine.onTouchStart = (hint) => {
      this.agent!.elementAt(hint.pixelX, hint.pixelY).then(element => {
        if (element) {
          this.prefetchedElement = element;
          this.prefetchCoords = { x: hint.pixelX, y: hint.pixelY };
        }
      }).catch(() => {});
    };

    this.geteventStream = new GeteventStream(serial, inputDevice.devicePath);

    this.geteventStream.on('line', (line: GeteventLine) => {
      this.emit('raw', line);
      const action = this.touchStateMachine.feed(line, this.converter!);
      if (action) {
        // Attach pre-fetched element if coordinates match
        const prefetched = this.consumePrefetch(action);
        this.collector!.onUserAction(action, prefetched);
      }
    });

    this.geteventStream.on('close', () => {
      if (this._connected) {
        // Unexpected close — try to reconnect
        this.scheduleReconnect();
      }
    });

    this.geteventStream.on('error', (err: Error) => {
      this.emit('error', err.message);
    });

    this.geteventStream.start();

    // 8. Accessibility event stream
    this.connectAccessibilityStream();

    // 9. Keyboard polling
    this.keyboardPollTimer = setInterval(async () => {
      try {
        const output = await this.adbExec(
          'shell', 'dumpsys input_method | grep -E "mInputShown|touchableRegion"'
        );
        const isOpen = output.includes('mInputShown=true');
        let keyboardTop = 0;
        const regionMatch = output.match(/touchableRegion=SkRegion\(\((\d+),(\d+),(\d+),(\d+)\)\)/);
        if (regionMatch) {
          keyboardTop = parseInt(regionMatch[2]);
        }
        this.collector?.setKeyboardState(isOpen, keyboardTop);
      } catch {}
    }, KEYBOARD_POLL_MS);

    this._connected = true;
    this.emit('connected');
  }

  /** Disconnect all streams */
  disconnect(): void {
    this._connected = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.keyboardPollTimer) {
      clearInterval(this.keyboardPollTimer);
      this.keyboardPollTimer = null;
    }

    this.collector?.flush();

    this.geteventStream?.stop();
    this.geteventStream = null;

    if (this.agentEventStream) {
      AgentClient.disconnectEventStream(this.agentEventStream);
      this.agentEventStream = null;
    }

    if (this.serial) {
      this.adbExec('forward', '--remove', `tcp:${this.agentPort}`).catch(() => {});
    }

    this.emit('disconnected');
  }

  /** Clear the interaction buffer */
  clear(): void {
    this._interactions = [];
  }

  /** Get interactions by IDs */
  getInteractionsByIds(ids: number[]): RecordedInteraction[] {
    const idSet = new Set(ids);
    return this._interactions.filter(i => idSet.has(i.id));
  }

  // --- Private ---

  /** Use pre-fetched element if action coordinates are close to prefetch coordinates */
  private consumePrefetch(action: UserAction): UiElement | null {
    if (!this.prefetchedElement || !this.prefetchCoords) return null;

    let ax: number, ay: number;
    if (action.type === 'tap' || action.type === 'longPress') {
      ax = action.x; ay = action.y;
    } else if (action.type === 'swipe' || action.type === 'scroll') {
      ax = action.startX; ay = action.startY;
    } else {
      return null;
    }

    const dx = Math.abs(ax - this.prefetchCoords.x);
    const dy = Math.abs(ay - this.prefetchCoords.y);
    const element = (dx < 30 && dy < 30) ? this.prefetchedElement : null;

    // Always consume — one use only
    this.prefetchedElement = null;
    this.prefetchCoords = null;
    return element;
  }

  private connectAccessibilityStream(): void {
    if (!this.agent) return;

    try {
      this.agentEventStream = this.agent.connectEventStream();

      this.agentEventStream.on('event', (event: any) => {
        const a11yEvent: AccessibilityEventData = {
          type: event.type,
          text: event.text,
          beforeText: event.beforeText,
          resourceId: event.resourceId,
          contentDescription: event.contentDescription,
          className: event.className,
          packageName: event.packageName,
          bounds: event.bounds,
          timestampMs: event.timestamp || Date.now(),
          direction: event.direction,
          addedCount: event.addedCount,
          removedCount: event.removedCount,
          extras: event.extras,
        };
        this.collector?.onAccessibilityEvent(a11yEvent);
      });

      this.agentEventStream.on('error', () => {
        // Non-fatal — getevent still works
      });

      this.agentEventStream.on('end', () => {
        // Stream ended — try to reconnect after delay
        if (this._connected) {
          setTimeout(() => this.connectAccessibilityStream(), RECONNECT_DELAY_MS);
        }
      });
    } catch {
      // Agent stream not available — continue without it
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this._connected || !this.serial) return;

      try {
        // Try to restart getevent stream
        const inputDevice = await discoverInputDevice(this.serial);
        this.touchStateMachine = new TouchStateMachine();
        this.geteventStream = new GeteventStream(this.serial, inputDevice.devicePath);

        this.geteventStream.on('line', (line: GeteventLine) => {
          this.emit('raw', line);
          const action = this.touchStateMachine.feed(line, this.converter!);
          if (action) {
            this.collector!.onUserAction(action);
          }
        });

        this.geteventStream.on('close', () => {
          if (this._connected) this.scheduleReconnect();
        });

        this.geteventStream.start();
      } catch {
        // Reconnect failed — try again
        if (this._connected) this.scheduleReconnect();
      }
    }, RECONNECT_DELAY_MS);
  }

  private adbExec(...args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile('adb', ['-s', this.serial!, ...args], (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      });
    });
  }
}
