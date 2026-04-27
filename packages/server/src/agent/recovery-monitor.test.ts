import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createRecoveryMonitor,
  RECOVERY_COOLDOWN_MS,
  MAX_CONSECUTIVE_RECOVERIES,
  type RecoveryMonitorDeps,
} from './recovery-monitor.js';

const flush = () => new Promise<void>(r => setImmediate(r));

interface Harness {
  monitor: ReturnType<typeof createRecoveryMonitor>;
  health: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  guard: ReturnType<typeof vi.fn>;
  now: { value: number };
}

function makeHarness(overrides: Partial<RecoveryMonitorDeps> = {}): Harness {
  const now = { value: 1_000_000 };
  const health = vi.fn(async () => true);
  const stop = vi.fn(async () => {});
  const start = vi.fn(async () => {});
  const guard = vi.fn(() => false);
  const monitor = createRecoveryMonitor({
    healthCheck: health,
    stopAgent: stop,
    startAgent: start,
    maestroGuard: guard,
    clock: () => now.value,
    ...overrides,
  });
  return { monitor, health, stop, start, guard, now };
}

describe('createRecoveryMonitor', () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  it('healthy tick keeps state clean', async () => {
    h.health.mockResolvedValue(true);
    await h.monitor.tick();
    expect(h.monitor.getState().staleCount).toBe(0);
    expect(h.stop).not.toHaveBeenCalled();
    expect(h.start).not.toHaveBeenCalled();
  });

  it('single stale tick increments staleCount but does not recover', async () => {
    h.health.mockResolvedValue(false);
    await h.monitor.tick();
    expect(h.monitor.getState().staleCount).toBe(1);
    expect(h.stop).not.toHaveBeenCalled();
  });

  it('two consecutive stale ticks trigger recovery', async () => {
    h.health.mockResolvedValue(false);
    await h.monitor.tick();
    await h.monitor.tick();
    await flush();
    await flush();
    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(h.start).toHaveBeenCalledTimes(1);
    expect(h.monitor.getState().consecutiveRecoveries).toBe(1);
  });

  it('recovery is blocked while a Maestro run is active', async () => {
    h.health.mockResolvedValue(false);
    h.guard.mockReturnValue(true);
    await h.monitor.tick();
    await h.monitor.tick();
    await flush();
    expect(h.stop).not.toHaveBeenCalled();
    expect(h.start).not.toHaveBeenCalled();
  });

  it('cooldown blocks a second recovery within RECOVERY_COOLDOWN_MS', async () => {
    h.health.mockResolvedValue(false);
    await h.monitor.tick();
    await h.monitor.tick();
    await flush();
    await flush();
    expect(h.stop).toHaveBeenCalledTimes(1);

    h.now.value += 10_000; // < 30_000
    await h.monitor.tick();
    await h.monitor.tick();
    await flush();
    expect(h.stop).toHaveBeenCalledTimes(1);
  });

  it('counters reset when a healthy tick follows', async () => {
    h.health.mockResolvedValue(false);
    await h.monitor.tick();
    await h.monitor.tick();
    await flush();
    await flush();
    expect(h.monitor.getState().consecutiveRecoveries).toBe(1);

    h.now.value += RECOVERY_COOLDOWN_MS + 1;
    h.health.mockResolvedValue(true);
    await h.monitor.tick();
    expect(h.monitor.getState().consecutiveRecoveries).toBe(0);
    expect(h.monitor.getState().staleCount).toBe(0);
  });

  it('gives up after MAX_CONSECUTIVE_RECOVERIES', async () => {
    h.health.mockResolvedValue(false);
    for (let i = 0; i < MAX_CONSECUTIVE_RECOVERIES; i++) {
      await h.monitor.tick();
      await h.monitor.tick();
      await flush();
      await flush();
      h.now.value += RECOVERY_COOLDOWN_MS + 1;
    }
    expect(h.stop).toHaveBeenCalledTimes(MAX_CONSECUTIVE_RECOVERIES);

    await h.monitor.tick();
    await h.monitor.tick();
    await flush();
    expect(h.stop).toHaveBeenCalledTimes(MAX_CONSECUTIVE_RECOVERIES);
  });

  it('recoveryInProgress prevents reentrancy when stopAgent never resolves', async () => {
    h.health.mockResolvedValue(false);
    let stopResolve!: () => void;
    h.stop.mockImplementation(() => new Promise<void>(r => { stopResolve = r; }));

    await h.monitor.tick();
    await h.monitor.tick();
    await flush();
    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(h.monitor.getState().recoveryInProgress).toBe(true);

    await h.monitor.tick();
    await flush();
    expect(h.stop).toHaveBeenCalledTimes(1);

    stopResolve();
    await flush();
    await flush();
    expect(h.monitor.getState().recoveryInProgress).toBe(false);
  });

  it('recoveryInProgress is set during recovery and cleared in .finally()', async () => {
    h.health.mockResolvedValue(false);
    let startResolve!: () => void;
    h.start.mockImplementation(() => new Promise<void>(r => { startResolve = r; }));

    await h.monitor.tick();
    await h.monitor.tick();
    await flush();
    expect(h.monitor.getState().recoveryInProgress).toBe(true);

    startResolve();
    await flush();
    await flush();
    expect(h.monitor.getState().recoveryInProgress).toBe(false);
  });

  it('healthCheck rejection is treated as stale, not crash', async () => {
    h.health.mockRejectedValue(new Error('network down'));
    await h.monitor.tick();
    expect(h.monitor.getState().staleCount).toBe(1);
    await h.monitor.tick();
    await flush();
    await flush();
    expect(h.stop).toHaveBeenCalledTimes(1);
  });
});
