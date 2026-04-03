import { EventEmitter } from 'events';
import { execFile } from 'child_process';
import type { UserAction, MaestroCommand, DeviceInfo } from '@maestro-recorder/shared';
import { GeteventStream, discoverInputDevice } from './getevent-parser.js';
import { TouchStateMachine } from './touch-state-machine.js';
import { CoordinateConverter } from './coordinate-converter.js';
import { AgentClient } from './agent-client.js';
import { EventCombiner } from './event-combiner.js';
import { YamlGenerator } from './yaml-generator.js';
import type { GeteventLine } from './types.js';

export class RecordingSession extends EventEmitter {
  private geteventStream: GeteventStream | null = null;
  private touchStateMachine = new TouchStateMachine();
  private converter: CoordinateConverter | null = null;
  private agent: AgentClient;
  private combiner: EventCombiner | null = null;
  private agentEventStream: EventEmitter | null = null;
  private yamlGenerator = new YamlGenerator();
  private _commands: MaestroCommand[] = [];
  private keyboardPollTimer: NodeJS.Timeout | null = null;

  get commands(): MaestroCommand[] { return this._commands; }

  constructor(
    private deviceSerial: string,
    private appId: string,
    private agentPort = 50051,
  ) {
    super();
    this.agent = new AgentClient(agentPort);
  }

  async start(): Promise<void> {
    // 1. Setup port forwarding
    await this.adbExec('forward', `tcp:${this.agentPort}`, `tcp:${this.agentPort}`);

    // 2. Check agent
    const agentAlive = await this.agent.ping();
    if (!agentAlive) {
      throw new Error(
        'Agent not running on device. Start it from the Agent tab.'
      );
    }

    // 3. Get device info
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

    // 4. Discover input device
    const inputDevice = await discoverInputDevice(this.deviceSerial);

    // 5. Setup coordinate converter
    this.converter = new CoordinateConverter(
      inputDevice.maxX, inputDevice.maxY,
      deviceInfo.screenWidth, deviceInfo.screenHeight,
    );

    // 6. Create EventCombiner (replaces old EventMerger)
    this.combiner = new EventCombiner(this.agent, deviceInfo.screenWidth, deviceInfo.screenHeight);

    // Forward combiner events to session
    this.combiner.on('command', (cmd: MaestroCommand) => this.addCommand(cmd));
    this.combiner.on('element', (data: any) => this.emit('element', data));
    this.combiner.on('action', (action: UserAction) => this.emit('action', action));

    // 7. Add launchApp as first command
    this.addCommand({ type: 'launchApp' });

    // 8. Start getevent stream (Source 1: touch coordinates)
    this.geteventStream = new GeteventStream(this.deviceSerial, inputDevice.devicePath);

    this.geteventStream.on('line', (line: GeteventLine) => {
      this.emit('raw', line);

      const action = this.touchStateMachine.feed(line, this.converter!);
      if (action) {
        this.combiner!.onUserAction(action);
      }
    });

    this.geteventStream.on('error', (err: Error) => {
      this.emit('error', err.message);
    });

    this.geteventStream.start();

    // 9. Connect to agent accessibility event stream (Source 2: text input, screen changes)
    try {
      this.agentEventStream = this.agent.connectEventStream();

      this.agentEventStream.on('event', (event: any) => {
        this.combiner!.onAccessibilityEvent(event);
      });

      this.agentEventStream.on('error', () => {
        // Agent stream failed — non-fatal, getevent still works
      });
    } catch {
      // Agent stream not available — continue without it
    }

    // 10. Poll keyboard state to filter keyboard taps (every 2s — not too frequent)
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

        this.combiner?.setKeyboardState(isOpen, keyboardTop);
      } catch {}
    }, 2000);

    this.emit('status', 'recording');
  }

  private addCommand(command: MaestroCommand): void {
    this._commands.push(command);
    this.emit('command', this.commandToDto(command));
  }

  async stop(): Promise<{ yaml: string; commands: MaestroCommand[] }> {
    // Flush pending text input
    this.combiner?.flush();

    if (this.keyboardPollTimer) {
      clearInterval(this.keyboardPollTimer);
      this.keyboardPollTimer = null;
    }

    this.geteventStream?.stop();
    this.geteventStream = null;

    if (this.agentEventStream) {
      AgentClient.disconnectEventStream(this.agentEventStream);
      this.agentEventStream = null;
    }

    try {
      await this.adbExec('forward', '--remove', `tcp:${this.agentPort}`);
    } catch {}

    const yaml = this.yamlGenerator.generate(this.appId, this._commands);

    this.emit('status', 'stopped');
    return { yaml, commands: this._commands };
  }

  private commandToDto(cmd: MaestroCommand): any {
    if ('selector' in cmd) {
      const sel = (cmd as any).selector;
      return {
        type: cmd.type,
        selector: {
          type: sel.kind === 'id' ? 'ById' : sel.kind === 'text' ? 'ByText' :
                sel.kind === 'contentDescription' ? 'ByContentDescription' : 'ByPoint',
          value: sel.kind === 'point' ? `${sel.x},${sel.y}` :
                 sel.kind === 'id' ? sel.id : sel.kind === 'text' ? sel.text : sel.description,
        },
      };
    }
    if (cmd.type === 'inputText') return { type: 'InputText', text: (cmd as any).text };
    if (cmd.type === 'swipe') return { type: 'Swipe', ...cmd };
    return { type: cmd.type };
  }

  private adbExec(...args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile('adb', ['-s', this.deviceSerial, ...args], (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      });
    });
  }
}
