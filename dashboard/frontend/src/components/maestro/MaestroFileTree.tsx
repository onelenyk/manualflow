import { useState } from 'react';
import type { MaestroProject, MaestroFile, MaestroFileKind } from '@maestro-recorder/shared';
import { api } from '../../api/client';

interface MaestroFileTreeProps {
  project: MaestroProject;
  selectedFilePath: string | null;
  onSelect: (path: string) => void;
  onRefresh: () => void;
}

interface DirNode {
  path: string;        // empty string for root, or 'flows/subdir'
  name: string;        // display name: '' for root, or 'subdir'
  depth: number;       // nesting level for indentation
  children: DirNode[]; // nested directories
  files: MaestroFile[]; // files in this directory
}

// Build a tree structure from flat files
function buildDirTree(files: MaestroFile[]): DirNode[] {
  const root: DirNode = { path: '', name: '', depth: 0, children: [], files: [] };
  const dirMap = new Map<string, DirNode>();
  dirMap.set('', root);

  // First, collect all unique directories and organize files
  for (const file of files) {
    const parts = file.relativePath.split('/');
    if (parts.length === 1) {
      // Root level file
      root.files.push(file);
      continue;
    }

    // Build/create parent directories
    let currentPath = '';
    let currentDir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      let dir = dirMap.get(currentPath);
      if (!dir) {
        dir = { path: currentPath, name: part, depth: i + 1, children: [], files: [] };
        dirMap.set(currentPath, dir);

        // Find parent and add this dir
        const parent = dirMap.get(parentPath)!;
        parent.children.push(dir);
      }
      currentDir = dir;
    }

    // Add file to its directory
    currentDir.files.push(file);
  }

  // Sort children: directories first (alphabetically), then files
  function sortDir(dir: DirNode) {
    dir.children.sort((a, b) => a.name.localeCompare(b.name));
    dir.files.sort((a, b) => a.name.localeCompare(b.name));
    dir.children.forEach(sortDir);
  }
  sortDir(root);

  return root.children;
}

function kindIcon(kind: MaestroFileKind): string {
  switch (kind) {
    case 'flow':    return 'P';
    case 'config':  return 'G';
    case 'draft':   return 'D';
    case 'unknown': return '!';
  }
}

function kindColor(kind: MaestroFileKind): string {
  switch (kind) {
    case 'flow':    return 'text-blue-400';
    case 'config':  return 'text-slate-400';
    case 'draft':   return 'text-yellow-400';
    case 'unknown': return 'text-red-400';
  }
}

interface CollapsibleDirProps {
  dir: DirNode;
  selectedFilePath: string | null;
  onSelect: (path: string) => void;
  onNewFlow: (dirPath: string) => void;
}

function CollapsibleDir({ dir, selectedFilePath, onSelect, onNewFlow }: CollapsibleDirProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = dir.children.length > 0 || dir.files.length > 0;

  const indentPx = dir.depth * 12;

  return (
    <div>
      {/* Directory header */}
      <div
        className="flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-slate-800/40 rounded transition-colors"
        style={{ paddingLeft: `${indentPx}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`text-slate-500 transition-transform ${expanded ? 'rotate-90' : ''}`}>
          ▶
        </span>
        <span className="text-slate-400 font-medium truncate">
          {dir.name || '(root)'}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onNewFlow(dir.path); }}
          className="ml-auto text-[10px] text-slate-500 hover:text-blue-400 px-1.5 py-0.5 rounded hover:bg-slate-700/50"
          title="New flow in this directory"
        >
          +
        </button>
      </div>

      {/* Directory contents */}
      {expanded && (
        <div>
          {/* Nested directories */}
          {dir.children.map((child) => (
            <CollapsibleDir
              key={child.path}
              dir={child}
              selectedFilePath={selectedFilePath}
              onSelect={onSelect}
              onNewFlow={onNewFlow}
            />
          ))}

          {/* Files in this directory */}
          {dir.files.map((file) => {
            const isSelected = file.path === selectedFilePath;
            const filePadding = (dir.depth + 1) * 12;
            return (
              <button
                key={file.path}
                onClick={() => onSelect(file.path)}
                title={file.path}
                className={`w-full text-left flex items-center gap-2 py-1 px-2 rounded transition-colors ${
                  isSelected
                    ? 'bg-blue-600/30 text-blue-200'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
                style={{ paddingLeft: `${filePadding}px` }}
              >
                <span className={`shrink-0 w-4 h-4 flex items-center justify-center rounded text-[10px] font-bold ${kindColor(file.kind)}`}>
                  {kindIcon(file.kind)}
                </span>
                <span className="truncate flex-1">{file.name}</span>
                {file.hasDraft && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400 border border-yellow-800/40">
                    Draft
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MaestroFileTree({ project, selectedFilePath, onSelect, onRefresh }: MaestroFileTreeProps) {
  const { scanInfo } = project;
  const [newFlowDir, setNewFlowDir] = useState<string | null>(null);
  const [newFlowName, setNewFlowName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const dirTree = buildDirTree(project.files);

  const handleNewFlow = (dirPath: string) => {
    setNewFlowDir(dirPath);
    setNewFlowName('');
    setCreateError(null);
  };

  const cancelNewFlow = () => {
    setNewFlowDir(null);
    setNewFlowName('');
    setCreateError(null);
  };

  const submitNewFlow = async () => {
    const name = newFlowName.trim();
    if (!name) {
      setCreateError('Name is required');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      setCreateError('Name must be alphanumeric (a-z, A-Z, 0-9, _, -)');
      return;
    }

    // Paths are relative to .maestro/, so add the prefix
    const relativePath = newFlowDir ? `${newFlowDir}/${name}.yaml` : `${name}.yaml`;
    const fullPath = `.maestro/${relativePath}`;

    setCreating(true);
    setCreateError(null);
    try {
      await api.saveMaestroFlow({
        path: fullPath,
        yaml: `# New flow: ${name}\n# Add your appId and commands below\n`,
        overwrite: false,
      });
      await onRefresh();
      onSelect(fullPath);
      cancelNewFlow();
    } catch (e: any) {
      setCreateError(e?.message ?? 'Failed to create flow');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto text-xs">
      {scanInfo.truncated && (
        <div className="px-3 py-2 mb-2 bg-amber-900/30 border border-amber-800/50 rounded-lg text-amber-300 text-xs">
          Showed first 1000 of {scanInfo.scanned}+ flow files (depth limited to 12). Move flows to a smaller subdirectory or split projects to see all.
        </div>
      )}

      {/* New flow button at top level */}
      <button
        onClick={() => handleNewFlow('')}
        className="mx-2 mb-2 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center gap-2"
      >
        <span>+</span>
        <span>New Flow</span>
      </button>

      {/* New flow modal */}
      {newFlowDir !== null && (
        <div className="mx-2 mb-2 p-3 bg-slate-800 border border-slate-700 rounded-lg">
          <div className="text-slate-300 font-medium mb-2">
            New flow {newFlowDir && <span className="text-slate-500">in /{newFlowDir}</span>}
          </div>
          <input
            type="text"
            value={newFlowName}
            onChange={(e) => setNewFlowName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitNewFlow()}
            placeholder="my-flow"
            autoFocus
            className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-600 text-slate-200 rounded focus:outline-none focus:border-blue-500 mb-2"
          />
          {createError && (
            <div className="text-[10px] text-red-400 mb-2">{createError}</div>
          )}
          <div className="flex gap-2">
            <button
              onClick={submitNewFlow}
              disabled={creating || !newFlowName.trim()}
              className="px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={cancelNewFlow}
              disabled={creating}
              className="px-3 py-1 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Directory tree */}
      <div className="flex-1 overflow-auto">
        {/* Root level files */}
        {dirTree.length === 0 && project.files.length === 0 && (
          <div className="text-slate-600 text-center py-8">No flow files found.</div>
        )}

        {/* Render directory tree */}
        {dirTree.map((dir) => (
          <CollapsibleDir
            key={dir.path}
            dir={dir}
            selectedFilePath={selectedFilePath}
            onSelect={onSelect}
            onNewFlow={handleNewFlow}
          />
        ))}

        {/* Root level files (when no subdirs exist) */}
        {dirTree.length === 0 && project.files.map((file) => {
          const isSelected = file.path === selectedFilePath;
          return (
            <button
              key={file.path}
              onClick={() => onSelect(file.path)}
              title={file.path}
              className={`w-full text-left flex items-center gap-2 py-1 px-2 rounded transition-colors ${
                isSelected
                  ? 'bg-blue-600/30 text-blue-200'
                  : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <span className={`shrink-0 w-4 h-4 flex items-center justify-center rounded text-[10px] font-bold ${kindColor(file.kind)}`}>
                {kindIcon(file.kind)}
              </span>
              <span className="truncate flex-1">{file.name}</span>
              {file.hasDraft && (
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400 border border-yellow-800/40">
                  Draft
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
