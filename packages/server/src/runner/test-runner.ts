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

export interface RunState {
  id: string;
  flowId: string;
  flowName: string;
  status: 'running' | 'passed' | 'failed' | 'stopped';
  startedAt: number;
  finishedAt?: number;
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

    proc.kill();
    const state = this.runs.get(runId);
    if (state) {
      state.status = 'stopped';
      state.finishedAt = Date.now();
    }
    this.processes.delete(runId);
    return true;
  }

  getStatus(runId: string): RunState | null {
    return this.runs.get(runId) ?? null;
  }

  listRuns(): RunState[] {
    return [...this.runs.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  private parseStepLine(state: RunState, line: string): void {
    // Maestro outputs steps like:
    // ⚙️  launchApp       or     ║  ⚙️  launchApp
    // ✅                  or     ║    ✅
    // ❌  Error message   or     ║    ❌  Error message

    const cleanLine = line.replace(/^[║│\s]+/, '');

    // Step started
    const stepMatch = cleanLine.match(/^[⚙️🔧]\s*(.+)/u) ||
                      cleanLine.match(/^>\s+(.+)/);
    if (stepMatch) {
      // Mark previous running step as passed
      const prev = state.steps[state.steps.length - 1];
      if (prev?.status === 'running') prev.status = 'passed';

      state.steps.push({
        command: stepMatch[1].trim(),
        status: 'running',
      });
      this.emit(`step:${state.id}`, state.steps);
      return;
    }

    // Step passed
    if (cleanLine.includes('✅') || cleanLine.includes('✓') || cleanLine.match(/COMPLETED/i)) {
      const last = state.steps[state.steps.length - 1];
      if (last) last.status = 'passed';
      this.emit(`step:${state.id}`, state.steps);
      return;
    }

    // Step failed
    const failMatch = cleanLine.match(/[❌✗]\s*(.*)/);
    if (failMatch) {
      const last = state.steps[state.steps.length - 1];
      if (last) {
        last.status = 'failed';
        last.error = failMatch[1].trim() || 'Failed';
      }
      this.emit(`step:${state.id}`, state.steps);
      return;
    }
  }
}
