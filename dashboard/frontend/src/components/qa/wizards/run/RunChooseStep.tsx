import { useState, useMemo } from 'react';
import { useMaestroProjectStore } from '../../../../stores/maestroProjectStore';
import { TestCard } from '../../shared/TestCard';
import type { MaestroFile } from '@maestro-recorder/shared';

export interface RunChooseStepProps {
  onSelectTest: (flowPath: string) => void;
  onRecordNew?: () => void;
}

export function RunChooseStep({ onSelectTest, onRecordNew }: RunChooseStepProps) {
  const project = useMaestroProjectStore((s) => s.project);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter flows by kind and search query
  const flows = useMemo(() => {
    const allFlows = project?.files.filter((f: MaestroFile) => f.kind === 'flow') ?? [];
    if (!searchQuery) return allFlows;

    const query = searchQuery.toLowerCase();
    return allFlows.filter((flow: MaestroFile) =>
      flow.name.toLowerCase().includes(query)
    );
  }, [project, searchQuery]);

  // Error states
  if (!project) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-500 mb-4">No test collection open. Open a collection?</div>
        <button
          onClick={() => {/* TODO: Trigger setup */}}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-all"
        >
          Open collection
        </button>
      </div>
    );
  }

  if (flows.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-500 mb-4">No tests in collection.</div>
        {onRecordNew && (
          <button
            onClick={onRecordNew}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-all"
          >
            Record a test
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search input */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Find a test..."
          className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
        />
      </div>

      {/* Test cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {flows.map((flow) => (
          <TestCard
            key={flow.path}
            testName={flow.name}
            lastRunStatus="never" // TODO: Get actual last run status
            lastRunTime={undefined} // TODO: Get actual last run time
            onClick={() => onSelectTest(flow.path)}
            onRunAction={() => onSelectTest(flow.path)}
          />
        ))}
      </div>

      {/* Results count */}
      {searchQuery && (
        <div className="text-center text-sm text-slate-500">
          Found {flows.length} test{flows.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
