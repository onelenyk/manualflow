import type { MaestroRunState } from '../../../stores/maestroRunStore';
import type { RunState } from '../../../stores/flowStore';

export function adaptMaestroRunState(maestroRun: MaestroRunState | null): RunState | null {
  if (!maestroRun) return null;

  return {
    id: maestroRun.id,
    flowId: maestroRun.flowId,
    flowName: maestroRun.flowName,
    status: maestroRun.status as RunState['status'],
    startedAt: maestroRun.startedAt,
    finishedAt: maestroRun.finishedAt,
    lines: maestroRun.lines,
    steps: maestroRun.steps.map((s) => ({
      command: s.command,
      status: s.status,
      error: s.error,
    })),
  };
}
