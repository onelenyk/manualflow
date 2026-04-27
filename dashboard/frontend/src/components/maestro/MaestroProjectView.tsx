import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useMaestroProjectStore } from '../../stores/maestroProjectStore';
import { useMaestroEditorStore } from '../../stores/maestroEditorStore';
import { useMaestroRunStore } from '../../stores/maestroRunStore';
import { MaestroFileTree } from './MaestroFileTree';
import { RulesBanner } from './RulesBanner';
import { MaestroFlowEditor } from './MaestroFlowEditor';
import { MaestroRunViewer } from './MaestroRunViewer';
import { AIPanel } from './AIPanel';
import type { MaestroProjectWarning } from '@maestro-recorder/shared';

function basenameOf(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.slice(idx + 1) : p;
}

function RunPaneAndAI({ selectedFilePath }: { selectedFilePath: string | null }) {
  const runActive = useMaestroRunStore((s) => s.active);
  const startRun = useMaestroRunStore((s) => s.start);
  const pauseRun = useMaestroRunStore((s) => s.pause);
  const resumeRun = useMaestroRunStore((s) => s.resume);
  const stopRun = useMaestroRunStore((s) => s.stop);
  const restartRun = useMaestroRunStore((s) => s.restart);
  const clearRun = useMaestroRunStore((s) => s.clear);

  const dirty = useMaestroEditorStore((s) => s.dirty);
  const isDraft = useMaestroEditorStore((s) => s.isDraft);

  const runDisabled = !!runActive || dirty || isDraft;
  const runTooltip = dirty || isDraft ? 'Save changes before running' : '';

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-auto">
        <MaestroRunViewer
          run={runActive as any}
          onPause={pauseRun}
          onResume={resumeRun}
          onStop={stopRun}
          onRestart={restartRun}
          onBack={clearRun}
        />
      </div>
      <div className="shrink-0 max-h-[40vh] overflow-auto">
        <AIPanel />
      </div>
      {selectedFilePath && (
        <button
          onClick={() => startRun(selectedFilePath)}
          disabled={runDisabled}
          title={runTooltip}
          className="shrink-0 px-3 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
        >
          Run {basenameOf(selectedFilePath)}
        </button>
      )}
    </div>
  );
}

function ProjectWarnings({ warnings }: { warnings: MaestroProjectWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 mb-3">
      {warnings.map((w) => (
        <div
          key={w.code}
          className="text-xs px-3 py-1.5 rounded bg-amber-900/30 border border-amber-800/40 text-amber-300"
        >
          [{w.code}] {w.message}
        </div>
      ))}
    </div>
  );
}

export function MaestroProjectView() {
  const { project, recents, loading, error, selectedFilePath, hydrate, openFolder, selectFile } =
    useMaestroProjectStore();

  const [inputPath, setInputPath] = useState('');
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      hydrate();
    }
  }, []);

  const handleOpen = () => {
    const path = inputPath.trim();
    if (path) openFolder(path);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleOpen();
  };

  const handleBrowse = async (defaultPath?: string) => {
    setPickError(null);
    setPicking(true);
    try {
      const res = await api.pickFolder({
        prompt: 'Select Maestro project folder',
        defaultPath,
      });
      if (res.canceled || !res.path) return;
      setInputPath(res.path);
      openFolder(res.path);
    } catch (e: any) {
      setPickError(e?.message ?? 'Folder picker failed');
    } finally {
      setPicking(false);
    }
  };

  // Loading spinner
  if (loading && !project) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-500 text-xs">Loading...</div>
      </div>
    );
  }

  // Empty state: no project loaded
  if (!project) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-slate-900/60 rounded-xl border border-slate-800 p-6 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-white">Open Maestro Project</h2>

          <div className="flex gap-2">
            <input
              type="text"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="/path/to/project"
              className="flex-1 px-3 py-2 text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-lg placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => handleBrowse(inputPath.trim() || undefined)}
              disabled={loading || picking}
              className="px-3 py-2 text-xs font-medium bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-100 rounded-lg transition-colors"
              title="Open native folder picker"
            >
              {picking ? 'Picking…' : 'Browse…'}
            </button>
            <button
              onClick={handleOpen}
              disabled={loading || !inputPath.trim()}
              className="px-4 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
            >
              {loading ? 'Opening...' : 'Open'}
            </button>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
          )}
          {pickError && (
            <div className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{pickError}</div>
          )}

          {recents.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-medium">Recent</div>
              <div className="flex flex-col gap-1">
                {recents.map((p) => (
                  <button
                    key={p}
                    onClick={() => openFolder(p)}
                    className="text-left text-xs text-slate-400 hover:text-white px-2 py-1.5 rounded hover:bg-slate-800 transition-colors truncate"
                    title={p}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Loaded state: three-column layout (CSS-only responsive)
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectWarnings warnings={project.warnings} />

      {/* Three-column layout, collapses via Tailwind at <xl */}
      <div className="flex-1 flex overflow-hidden gap-3 min-h-0">
        {/* Left: file tree (~280px) */}
        <div className="hidden xl:flex flex-col w-[280px] shrink-0 bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800 shrink-0 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate" title={project.rootPath}>
              Files
            </h3>
            <button
              onClick={() => handleBrowse(project.rootPath)}
              disabled={picking || loading}
              className="px-2 py-1 text-[10px] font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-white rounded transition-colors shrink-0"
              title="Change project folder"
            >
              {picking ? '…' : 'Change…'}
            </button>
          </div>
          {pickError && (
            <div className="mx-2 mt-2 text-[11px] text-red-300 bg-red-900/30 border border-red-800/40 rounded px-2 py-1">
              {pickError}
            </div>
          )}
          <div className="flex-1 overflow-auto p-2">
            <MaestroFileTree
              project={project}
              selectedFilePath={selectedFilePath}
              onSelect={(path) => selectFile(path)}
              onRefresh={hydrate}
            />
          </div>
        </div>

        {/* Middle: rules banner + editor */}
        <div className="hidden xl:flex flex-col flex-1 gap-3 min-w-0 overflow-hidden">
          <RulesBanner rules={project.rules} />
          <div className="flex-1 bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
            <MaestroFlowEditor />
          </div>
        </div>

        {/* Right: run viewer + AI panel */}
        <div className="hidden xl:flex flex-col w-[360px] shrink-0 min-h-0">
          <RunPaneAndAI selectedFilePath={selectedFilePath} />
        </div>

        {/* Mobile/tablet tab switcher (shown below xl) */}
        <MobileTabs project={project} selectedFilePath={selectedFilePath} onSelect={selectFile} onRefresh={hydrate} />
      </div>
    </div>
  );
}

// Shown only on screens <xl as a tab-based alternative
function MobileTabs({
  project,
  selectedFilePath,
  onSelect,
  onRefresh,
}: {
  project: NonNullable<ReturnType<typeof useMaestroProjectStore.getState>['project']>;
  selectedFilePath: string | null;
  onSelect: (path: string | null) => void;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<'files' | 'editor' | 'run'>('files');

  return (
    <div className="flex xl:hidden flex-col flex-1 overflow-hidden gap-2">
      {/* Tab bar */}
      <div className="flex gap-1 shrink-0">
        {(['files', 'editor', 'run'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors ${
              tab === t
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
        {tab === 'files' && (
          <div className="h-full flex flex-col">
            <div className="px-3 py-2 border-b border-slate-800 shrink-0">
              <RulesBanner rules={project.rules} />
            </div>
            <div className="flex-1 overflow-auto p-2">
              <MaestroFileTree
                project={project}
                selectedFilePath={selectedFilePath}
                onSelect={onSelect}
                onRefresh={onRefresh}
              />
            </div>
          </div>
        )}
        {tab === 'editor' && (
          <div className="h-full overflow-hidden">
            <MaestroFlowEditor />
          </div>
        )}
        {tab === 'run' && (
          <div className="h-full p-2 overflow-auto">
            <RunPaneAndAI selectedFilePath={selectedFilePath} />
          </div>
        )}
      </div>
    </div>
  );
}
