import type { MaestroProject, MaestroFile, MaestroFileKind } from '@maestro-recorder/shared';

interface MaestroFileTreeProps {
  project: MaestroProject;
  selectedFilePath: string | null;
  onSelect: (path: string) => void;
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

// Group files by their parent directory relative to the project root
function groupByDir(files: MaestroFile[]): Map<string, MaestroFile[]> {
  const map = new Map<string, MaestroFile[]>();
  for (const file of files) {
    const parts = file.relativePath.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    const existing = map.get(dir);
    if (existing) {
      existing.push(file);
    } else {
      map.set(dir, [file]);
    }
  }
  return map;
}

export function MaestroFileTree({ project, selectedFilePath, onSelect }: MaestroFileTreeProps) {
  const { scanInfo } = project;
  const grouped = groupByDir(project.files);

  // Sort directories: root first, then alphabetically
  const dirs = Array.from(grouped.keys()).sort((a, b) => {
    if (a === '') return -1;
    if (b === '') return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="flex flex-col h-full overflow-auto text-xs">
      {scanInfo.truncated && (
        <div className="px-3 py-2 mb-2 bg-amber-900/30 border border-amber-800/50 rounded-lg text-amber-300 text-xs">
          Showed first 1000 of {scanInfo.scanned}+ flow files (depth limited to 12). Move flows to a smaller subdirectory or split projects to see all.
        </div>
      )}

      {dirs.map((dir) => {
        const files = grouped.get(dir)!;
        const indentLevel = dir === '' ? 0 : dir.split('/').length;
        const indentPx = indentLevel * 12;

        return (
          <div key={dir}>
            {dir !== '' && (
              <div
                className="text-slate-500 font-medium py-1 px-2 sticky top-0 bg-slate-900/80"
                style={{ paddingLeft: `${indentPx}px` }}
              >
                {dir.split('/').pop()}
              </div>
            )}
            {files.map((file) => {
              const isSelected = file.path === selectedFilePath;
              const filePadding = (indentLevel + 1) * 12;
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
        );
      })}

      {project.files.length === 0 && (
        <div className="text-slate-600 text-center py-8">No flow files found.</div>
      )}
    </div>
  );
}
