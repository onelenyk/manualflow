import { describe, it, expect } from 'vitest';
import { adaptMaestroRunState } from './RunStateAdapter';
import type { MaestroRunState } from '../../../stores/maestroRunStore';

describe('RunStateAdapter', () => {
  it('converts MaestroRunState to RunState correctly', () => {
    const maestroRun: MaestroRunState = {
      id: '123',
      flowId: 'flow1',
      flowName: 'Login Test',
      flowPath: '.maestro/login.yaml',
      status: 'running',
      startedAt: Date.now(),
      steps: [
        { command: 'tapOn', status: 'passed' },
        { command: 'assertVisible', status: 'running', error: 'Element not found' },
      ],
      lines: ['line 1', 'line 2'],
    };

    const adapted = adaptMaestroRunState(maestroRun);

    expect(adapted).not.toBeNull();
    expect(adapted?.id).toBe('123');
    expect(adapted?.flowId).toBe('flow1');
    expect(adapted?.flowName).toBe('Login Test');
    expect(adapted?.status).toBe('running');
    expect(adapted?.startedAt).toBe(maestroRun.startedAt);
    expect(adapted?.finishedAt).toBeUndefined();
    expect(adapted?.lines).toEqual(['line 1', 'line 2']);
    expect(adapted?.steps).toHaveLength(2);
    expect(adapted?.steps[0]).toEqual({ command: 'tapOn', status: 'passed' });
    expect(adapted?.steps[1]).toEqual({ command: 'assertVisible', status: 'running', error: 'Element not found' });
  });

  it('returns null for null input', () => {
    const adapted = adaptMaestroRunState(null);
    expect(adapted).toBeNull();
  });

  it('preserves finishedAt when present', () => {
    const maestroRun: MaestroRunState = {
      id: '456',
      flowId: 'flow2',
      flowName: 'Checkout Test',
      flowPath: '.maestro/checkout.yaml',
      status: 'passed',
      startedAt: Date.now() - 10000,
      finishedAt: Date.now(),
      steps: [{ command: 'tapOn', status: 'passed' }],
      lines: [],
    };

    const adapted = adaptMaestroRunState(maestroRun);

    expect(adapted?.finishedAt).toBe(maestroRun.finishedAt);
  });

  it('handles all status types', () => {
    const statuses: MaestroRunState['status'][] = ['running', 'paused', 'passed', 'failed', 'stopped'];

    statuses.forEach((status) => {
      const maestroRun: MaestroRunState = {
        id: '789',
        flowId: 'flow3',
        flowName: 'Status Test',
        flowPath: '.maestro/status.yaml',
        status,
        startedAt: Date.now(),
        steps: [],
        lines: [],
      };

      const adapted = adaptMaestroRunState(maestroRun);
      expect(adapted?.status).toBe(status);
    });
  });
});
