import { EventEmitter } from 'events';
import { execFile } from 'child_process';
import type { UserAction, MaestroCommand, DeviceInfo } from '@maestro-recorder/shared';
import { GeteventStream, discoverInputDevice } from './getevent-parser.js';
import { TouchStateMachine } from './touch-state-machine.js';
import { CoordinateConverter } from './coordinate-converter.js';
import { AgentClient } from './agent-client.js';
import { EventMerger } from './event-merger.js';
import { YamlGenerator } from './yaml-generator.js';
import type { GeteventLine } from './types.js';

export class RecordingSession extends EventEmitter {
  private geteventStream: GeteventStream | null = null;
  private touchStateMachine = new TouchStateMachine();
  private converter: CoordinateConverter | null = null;
  private agent: AgentClient;
  private merger: EventMerger | null = null;
  private yamlGenerator = new YamlGenerator();
  private _commands: MaestroCommand[] = [];
  private deviceInfo: DeviceInfo | null = null;

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
        'Agent not running on device. Start it with:\n' +
        'adb shell am instrument -w -e class com.maestrorecorder.agent.RecorderInstrumentation#startServer ' +
        'com.maestrorecorder.agent.test/androidx.test.runner.AndroidJUnitRunner'
      );
    }

    // 3. Get device info
    this.deviceInfo = await this.agent.deviceInfo();
    if (!this.deviceInfo) {
      // Fallback to ADB
      const sizeOutput = await this.adbExec('shell', 'wm', 'size');
      const m = sizeOutput.match(/(\d+)x(\d+)/);
      this.deviceInfo = {
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
      this.deviceInfo.screenWidth, this.deviceInfo.screenHeight,
    );

    // 6. Setup event merger
    this.merger = new EventMerger(this.agent, this.deviceInfo.screenWidth, this.deviceInfo.screenHeight);

    // 7. Add launchApp as first command
    this.addCommand({ type: 'launchApp' });

    // 8. Start getevent stream
    this.geteventStream = new GeteventStream(this.deviceSerial, inputDevice.devicePath);

    this.geteventStream.on('line', (line: GeteventLine) => {
      // Emit raw getevent line
      this.emit('raw', line);

      const action = this.touchStateMachine.feed(line, this.converter!);
      if (action) {
        this.onUserAction(action);
      }
    });

    this.geteventStream.on('error', (err: Error) => {
      this.emit('error', err.message);
    });

    this.geteventStream.start();
    this.emit('status', 'recording');
  }

  private async onUserAction(action: UserAction): Promise<void> {
    if (!this.merger) return;

    // Emit raw parsed action (for Parsed tab)
    this.emit('action', action);

    try {
      const { command, element } = await this.merger.merge(action);

      // Emit element data (for Element tab)
      if (element) {
        this.emit('element', { action, element });
      }

      this.addCommand(command);

      // Detect text input for taps on text fields
      if (action.type === 'tap' && element) {
        const text = await this.merger.detectTextInput(element, action.x, action.y);
        if (text) {
          this.addCommand({ type: 'inputText', text });
        }
      }
    } catch (err) {
      // Skip failed merges silently
    }
  }

  private addCommand(command: MaestroCommand): void {
    this._commands.push(command);
    this.emit('command', this.commandToDto(command));
  }

  async stop(): Promise<{ yaml: string; commands: MaestroCommand[] }> {
    this.geteventStream?.stop();
    this.geteventStream = null;

    // Remove port forward
    try {
      await this.adbExec('forward', '--remove', `tcp:${this.agentPort}`);
    } catch {}

    const yaml = this.yamlGenerator.generate(this.appId, this._commands);

    this.emit('status', 'stopped');
    return { yaml, commands: this._commands };
  }

  private commandToDto(cmd: MaestroCommand): any {
    if (cmd.type === 'tapOn' || cmd.type === 'longPressOn' || cmd.type === 'doubleTapOn' ||
        cmd.type === 'assertVisible' || cmd.type === 'assertNotVisible' || cmd.type === 'scrollUntilVisible') {
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
    if (cmd.type === 'inputText') return { type: 'InputText', text: cmd.text };
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
