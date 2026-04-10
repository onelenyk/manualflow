import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';

export interface StepResult {
  command: string;
  status: 'running' | 'passed' | 'failed' | 'skipped';
  durationMs?: number;
  error?: string;
}

export type RunStatus = 'running' | 'paused' | 'passed' | 'failed' | 'stopped';

export interface RunState {
  id: string;
  flowId: string;
  flowName: string;
  status: RunStatus;
  startedAt: number;
  finishedAt?: number;
  pausedAt?: number;
  pausedElapsedMs?: number;
  lines: string[];
  steps: StepResult[];
  exitCode?: number;
}

const MAESTRO_BIN = path.join(os.homedir(), '.maestro', 'bin', 'maestro');

/**
 * Manages Maestro test runs.
 * Emits per-run events: 'line:<runId>', 'step:<runId>', 'done:<runId>'
 */
export class TestRunner extends EventEmitter {
  private processes = new Map<string, ChildProcess>();
  private runs = new Map<string, RunState>();
  private nextId = 1;

  start(flowId: string, flowName: string, yamlPath: string, deviceSerial?: string): RunState {
    const id = `run-${this.nextId++}`;

    const state: RunState = {
      id,
      flowId,
      flowName,
      status: 'running',
      startedAt: Date.now(),
      lines: [],
      steps: [],
    };

    this.runs.set(id, state);

    const args = ['test', '--no-ansi'];
    if (deviceSerial) args.push('--udid', deviceSerial);
    args.push(yamlPath);

    const proc = spawn(MAESTRO_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, TERM: 'dumb' },
    });

    this.processes.set(id, proc);

    const handleOutput = (chunk: Buffer) => {
      const text = chunk.toString();
      for (const rawLine of text.split('\n')) {
        const line = rawLine.replace(/\x1b\[[0-9;]*m/g, '').trim();
        if (!line) continue;

        state.lines.push(line);
        this.emit(`line:${id}`, line);

        // Parse step progress from maestro output
        this.parseStepLine(state, line);
      }
    };

    proc.stdout?.on('data', handleOutput);
    proc.stderr?.on('data', handleOutput);

    proc.on('close', (code) => {
      state.exitCode = code ?? 1;
      state.status = code === 0 ? 'passed' : 'failed';
      state.finishedAt = Date.now();

      // Mark any still-running steps
      for (const step of state.steps) {
        if (step.status === 'running') {
          step.status = code === 0 ? 'passed' : 'failed';
        }
      }

      this.processes.delete(id);
      this.emit(`done:${id}`, state);
    });

    proc.on('error', (err) => {
      state.status = 'failed';
      state.finishedAt = Date.now();
      state.lines.push(`Error: ${err.message}`);
      this.processes.delete(id);
      this.emit(`done:${id}`, state);
    });

    return state;
  }

  stop(runId: string): boolean {
    const proc = this.processes.get(runId);
    if (!proc) return false;

    // If paused, we must SIGCONT before SIGTERM — otherwise the process
    // can't receive the terminate signal.
    const state = this.runs.get(runId);
    if (state?.status === 'paused') {
      try { proc.kill('SIGCONT'); } catch {}
    }
    proc.kill();
    if (state) {
      state.status = 'stopped';
      state.finishedAt = Date.now();
    }
    this.processes.delete(runId);
    this.emit(`step:${runId}`, state?.steps ?? []);
    return true;
  }

  /**
   * Pause a running test via SIGSTOP. POSIX only — Windows has no equivalent.
   * The subprocess freezes in-place; resume continues from the exact state.
   */
  pause(runId: string): boolean {
    const proc = this.processes.get(runId);
    const state = this.runs.get(runId);
    if (!proc || !state || state.status !== 'running') return false;

    try {
      proc.kill('SIGSTOP');
    } catch {
      return false;
    }
    state.status = 'paused';
    state.pausedAt = Date.now();
    this.emit(`step:${runId}`, state.steps);
    return true;
  }

  /** Resume a paused test via SIGCONT. */
  resume(runId: string): boolean {
    const proc = this.processes.get(runId);
    const state = this.runs.get(runId);
    if (!proc || !state || state.status !== 'paused') return false;

    try {
      proc.kill('SIGCONT');
    } catch {
      return false;
    }
    if (state.pausedAt) {
      state.pausedElapsedMs = (state.pausedElapsedMs ?? 0) + (Date.now() - state.pausedAt);
      state.pausedAt = undefined;
    }
    state.status = 'running';
    this.emit(`step:${runId}`, state.steps);
    return true;
  }

  getStatus(runId: string): RunState | null {
    return this.runs.get(runId) ?? null;
  }

  listRuns(): RunState[] {
    return [...this.runs.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  private parseStepLine(state: RunState, line: string): void {
    const cleanLine = line.replace(/^[║│\s]+/, '').trim();
    if (!cleanLine) return;

    // Maestro --no-ansi output format:
    //   Launch app "com.example"...
    //   COMPLETED
    //   Assert that "Login" is visible...
    //   FAILED
    //   Tap on "Button"...
    //   COMPLETED

    // Step started: lines ending with "..."
    const stepMatch = cleanLine.match(/^(.+)\.\.\.\s*$/);
    if (stepMatch) {
      // Mark previous running step as passed (if no explicit COMPLETED came)
      const prev = state.steps[state.steps.length - 1];
      if (prev?.status === 'running') prev.status = 'passed';

      state.steps.push({
        command: stepMatch[1].trim(),
        status: 'running',
      });
      this.emit(`step:${state.id}`, state.steps);
      return;
    }

    // Flow header: "> Flow name"
    if (cleanLine.startsWith('> Flow')) return;

    // Step passed: COMPLETED
    if (cleanLine === 'COMPLETED') {
      const last = state.steps[state.steps.length - 1];
      if (last) last.status = 'passed';
      this.emit(`step:${state.id}`, state.steps);
      return;
    }

    // Step failed: FAILED
    if (cleanLine === 'FAILED') {
      const last = state.steps[state.steps.length - 1];
      if (last) last.status = 'failed';
      this.emit(`step:${state.id}`, state.steps);
      return;
    }

    // Error details after FAILED
    if (state.steps.length > 0) {
      const last = state.steps[state.steps.length - 1];
      if (last.status === 'failed' && !last.error && !cleanLine.startsWith('==') && !cleanLine.startsWith('Possible') && !cleanLine.startsWith('-')) {
        last.error = cleanLine;
        this.emit(`step:${state.id}`, state.steps);
      }
    }

    // Also handle emoji format (when --no-ansi is not used)
    if (cleanLine.includes('✅') || cleanLine.includes('✓')) {
      const last = state.steps[state.steps.length - 1];
      if (last) last.status = 'passed';
      this.emit(`step:${state.id}`, state.steps);
    }
    const emojiStepMatch = cleanLine.match(/^(?:\u2699|\u{1F527})\ufe0f?\s*(.+)/u);
    if (emojiStepMatch) {
      const prev = state.steps[state.steps.length - 1];
      if (prev?.status === 'running') prev.status = 'passed';
      state.steps.push({ command: emojiStepMatch[1].trim(), status: 'running' });
      this.emit(`step:${state.id}`, state.steps);
    }
    const emojiFailMatch = cleanLine.match(/[❌✗]\s*(.*)/);
    if (emojiFailMatch) {
      const last = state.steps[state.steps.length - 1];
      if (last) { last.status = 'failed'; last.error = emojiFailMatch[1].trim() || 'Failed'; }
      this.emit(`step:${state.id}`, state.steps);
    }
  }
}
