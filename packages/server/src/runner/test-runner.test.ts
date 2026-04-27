import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { TestRunner, DeviceBusyError, type RunState } from './test-runner.js';

// --- Mock child_process.spawn ---
// Each test controls a fake ChildProcess so we can drive stdout/stderr
// and exit codes without actually executing Maestro.

interface FakeProc extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  killed?: boolean;
}

const fakeProcs: FakeProc[] = [];

vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    const proc = new EventEmitter() as FakeProc;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = vi.fn();
    fakeProcs.push(proc);
    return proc;
  }),
}));

function latestProc(): FakeProc {
  return fakeProcs[fakeProcs.length - 1];
}

function feedStdout(proc: FakeProc, text: string) {
  proc.stdout.emit('data', Buffer.from(text));
}

describe('TestRunner', () => {
  let runner: TestRunner;

  beforeEach(() => {
    fakeProcs.length = 0;
    runner = new TestRunner();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── Lifecycle ──────────────────────────────────────────────

  describe('start', () => {
    it('creates a new run with running status and unique id', async () => {
      const run = await runner.start('flow-1', 'My Flow', '/tmp/flow.yaml');
      expect(run.id).toMatch(/^run-\d+$/);
      expect(run.flowId).toBe('flow-1');
      expect(run.flowName).toBe('My Flow');
      expect(run.status).toBe('running');
      expect(run.steps).toEqual([]);
      expect(run.lines).toEqual([]);
    });

    it('generates sequential run ids', async () => {
      const a = await runner.start('f', 'A', '/a');
      const b = await runner.start('f', 'B', '/b');
      expect(a.id).not.toBe(b.id);
    });

    it('retrieves the run via getStatus', async () => {
      const run = await runner.start('f', 'A', '/a');
      expect(runner.getStatus(run.id)).toBe(run);
    });

    it('lists runs newest-first', async () => {
      const a = await runner.start('f', 'A', '/a');
      // force differing startedAt
      (runner.getStatus(a.id) as RunState).startedAt = 100;
      const b = await runner.start('f', 'B', '/b');
      (runner.getStatus(b.id) as RunState).startedAt = 200;
      expect(runner.listRuns().map(r => r.id)).toEqual([b.id, a.id]);
    });
  });

  describe('stop', () => {
    it('kills the process and marks run as stopped', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      expect(runner.stop(run.id)).toBe(true);
      expect(proc.kill).toHaveBeenCalled();
      expect(runner.getStatus(run.id)?.status).toBe('stopped');
      expect(runner.getStatus(run.id)?.finishedAt).toBeDefined();
    });

    it('returns false for unknown run id', () => {
      expect(runner.stop('run-nope')).toBe(false);
    });

    it('sends SIGCONT before SIGTERM when stopping a paused run', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      runner.pause(run.id);
      runner.stop(run.id);
      const signals = proc.kill.mock.calls.map(c => c[0]);
      expect(signals).toContain('SIGCONT');
      // Default kill() (no arg) sends SIGTERM
      expect(signals.some(s => s === undefined || s === 'SIGTERM')).toBe(true);
    });
  });

  // ─── Pause / Resume ─────────────────────────────────────────

  describe('pause / resume', () => {
    it('pause(): sends SIGSTOP and marks status as paused', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      expect(runner.pause(run.id)).toBe(true);
      expect(proc.kill).toHaveBeenCalledWith('SIGSTOP');
      expect(runner.getStatus(run.id)?.status).toBe('paused');
      expect(runner.getStatus(run.id)?.pausedAt).toBeDefined();
    });

    it('resume(): sends SIGCONT and returns to running', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      runner.pause(run.id);
      expect(runner.resume(run.id)).toBe(true);
      expect(proc.kill).toHaveBeenCalledWith('SIGCONT');
      expect(runner.getStatus(run.id)?.status).toBe('running');
    });

    it('resume(): accumulates paused elapsed time', async () => {
      const run = await runner.start('f', 'A', '/a');
      runner.pause(run.id);
      await new Promise(r => setTimeout(r, 25));
      runner.resume(run.id);
      const elapsed = runner.getStatus(run.id)?.pausedElapsedMs ?? 0;
      expect(elapsed).toBeGreaterThanOrEqual(20);
    });

    it('pause() fails if run is not running', async () => {
      const run = await runner.start('f', 'A', '/a');
      runner.pause(run.id);
      // Already paused
      expect(runner.pause(run.id)).toBe(false);
    });

    it('resume() fails if run is not paused', async () => {
      const run = await runner.start('f', 'A', '/a');
      expect(runner.resume(run.id)).toBe(false);
    });

    it('pause()/resume() return false for unknown run', () => {
      expect(runner.pause('run-nope')).toBe(false);
      expect(runner.resume('run-nope')).toBe(false);
    });
  });

  // ─── Process lifecycle events ───────────────────────────────

  describe('process events', () => {
    it('on clean exit (code 0) marks status=passed and emits done', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      const done = vi.fn();
      runner.on(`done:${run.id}`, done);
      proc.emit('close', 0);
      expect(runner.getStatus(run.id)?.status).toBe('passed');
      expect(runner.getStatus(run.id)?.exitCode).toBe(0);
      expect(done).toHaveBeenCalled();
    });

    it('on non-zero exit marks status=failed', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      proc.emit('close', 1);
      expect(runner.getStatus(run.id)?.status).toBe('failed');
      expect(runner.getStatus(run.id)?.exitCode).toBe(1);
    });

    it('leftover running steps get finalised on close', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      feedStdout(proc, 'Tap on "Login"...\n');
      expect(runner.getStatus(run.id)?.steps[0].status).toBe('running');
      proc.emit('close', 0);
      expect(runner.getStatus(run.id)?.steps[0].status).toBe('passed');
    });
  });

  // ─── Step parsing (real parser through real stdout) ────────

  describe('parseStepLine via stdout', () => {
    it('parses a running → completed step (no-ansi format)', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      feedStdout(proc, 'Tap on "Submit"...\n');
      feedStdout(proc, 'COMPLETED\n');
      const steps = runner.getStatus(run.id)!.steps;
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({ command: 'Tap on "Submit"', status: 'passed' });
    });

    it('parses a failed step with error details', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      feedStdout(proc, 'Assert "Welcome" is visible...\n');
      feedStdout(proc, 'FAILED\n');
      feedStdout(proc, 'Element not found\n');
      const step = runner.getStatus(run.id)!.steps[0];
      expect(step.status).toBe('failed');
      expect(step.error).toBe('Element not found');
    });

    it('ignores "> Flow ..." header lines', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      feedStdout(proc, '> Flow\n');
      feedStdout(proc, 'Launch app "com.x"...\n');
      expect(runner.getStatus(run.id)!.steps).toHaveLength(1);
    });

    it('tolerates ║/│ prefixes that Maestro sometimes emits', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      feedStdout(proc, '║  Tap on "Ok"...\n');
      feedStdout(proc, '║  COMPLETED\n');
      const steps = runner.getStatus(run.id)!.steps;
      expect(steps[0]).toMatchObject({ command: 'Tap on "Ok"', status: 'passed' });
    });

    it('strips ANSI color codes before parsing', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      feedStdout(proc, '\x1b[32mTap on "Go"...\x1b[0m\n');
      feedStdout(proc, '\x1b[32mCOMPLETED\x1b[0m\n');
      expect(runner.getStatus(run.id)!.steps[0].command).toBe('Tap on "Go"');
    });

    it('auto-closes a running step when a new step starts', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      feedStdout(proc, 'Step 1...\n');
      feedStdout(proc, 'Step 2...\n');
      const steps = runner.getStatus(run.id)!.steps;
      expect(steps).toHaveLength(2);
      expect(steps[0].status).toBe('passed');
      expect(steps[1].status).toBe('running');
    });

    it('emits step events incrementally', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      const onStep = vi.fn();
      runner.on(`step:${run.id}`, onStep);
      feedStdout(proc, 'Step 1...\n');
      feedStdout(proc, 'COMPLETED\n');
      expect(onStep).toHaveBeenCalledTimes(2);
    });

    it('emits line events for every non-empty output line', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      const onLine = vi.fn();
      runner.on(`line:${run.id}`, onLine);
      feedStdout(proc, 'foo\nbar\n\nbaz\n');
      expect(onLine).toHaveBeenCalledTimes(3);
      expect(onLine).toHaveBeenNthCalledWith(1, 'foo');
      expect(onLine).toHaveBeenNthCalledWith(2, 'bar');
      expect(onLine).toHaveBeenNthCalledWith(3, 'baz');
    });

    it('handles emoji format fallback (⚙️/✅/❌)', async () => {
      const run = await runner.start('f', 'A', '/a');
      const proc = latestProc();
      feedStdout(proc, '⚙️ Launch app\n');
      feedStdout(proc, '✅\n');
      feedStdout(proc, '⚙️ Tap\n');
      feedStdout(proc, '❌ boom\n');
      const steps = runner.getStatus(run.id)!.steps;
      expect(steps).toHaveLength(2);
      expect(steps[0]).toMatchObject({ command: 'Launch app', status: 'passed' });
      expect(steps[1]).toMatchObject({ status: 'failed', error: 'boom' });
    });
  });

  // ─── Per-device-serial busy lock ───────────────────────────

  describe('device-busy reservation', () => {
    it('throws DeviceBusyError synchronously when serial is reserved', async () => {
      // First call reserves serial-X (no preStart, spawn happens this tick).
      const firstPromise = runner.start('f1', 'A', 'p1', 'serial-X');

      // Second call must throw SYNCHRONOUSLY — not as a rejected promise.
      expect(() => runner.start('f2', 'B', 'p2', 'serial-X')).toThrow(DeviceBusyError);

      // First promise still resolves cleanly.
      const first = await firstPromise;
      expect(first.id).toMatch(/^run-\d+$/);
      expect(first.serial).toBe('serial-X');
    });

    it('DeviceBusyError carries the active run id', async () => {
      const first = await runner.start('f1', 'A', 'p1', 'serial-Y');
      try {
        runner.start('f2', 'B', 'p2', 'serial-Y');
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(DeviceBusyError);
        expect((err as DeviceBusyError).deviceSerial).toBe('serial-Y');
        expect((err as DeviceBusyError).activeRunId).toBe(first.id);
      }
    });

    it('releases serial when done event fires; second start succeeds', async () => {
      const first = await runner.start('f1', 'A', 'p1', 'serial-Z');
      const proc = latestProc();
      // Simulate maestro exit. Runner emits done:<id> from close handler,
      // which the once-listener uses to delete the serial reservation.
      proc.emit('close', 0);

      const second = await runner.start('f2', 'B', 'p2', 'serial-Z');
      expect(second.id).not.toBe(first.id);
      expect(second.serial).toBe('serial-Z');
    });

    it('preStart throw releases the serial', async () => {
      await expect(
        runner.start('f1', 'A', 'p1', 'serial-W', async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      // Same serial must now be free.
      const recovered = await runner.start('f2', 'B', 'p2', 'serial-W');
      expect(recovered.serial).toBe('serial-W');
    });

    it('runs without serial are not gated by the busy lock', async () => {
      const a = await runner.start('f1', 'A', 'p1');
      const b = await runner.start('f2', 'B', 'p2');
      expect(a.id).not.toBe(b.id);
      expect(a.serial).toBeUndefined();
      expect(b.serial).toBeUndefined();
    });

    it('preStart runs after reservation and before spawn', async () => {
      const events: string[] = [];
      const promise = runner.start(
        'f1', 'A', 'p1', 'serial-PS',
        async () => { events.push('preStart'); },
      );
      // Reservation already happened — second start must throw synchronously.
      expect(() => runner.start('f2', 'B', 'p2', 'serial-PS')).toThrow(DeviceBusyError);
      await promise;
      events.push('after-start');
      expect(events).toEqual(['preStart', 'after-start']);
    });
  });
});
