import { BrowserWindow, dialog } from 'electron';

/**
 * On first launch (no Maestro project configured) prompt the user for a
 * folder and save it via the server's /api/maestro/project endpoint.
 *
 * Plan reference: §5 Phase 4 deliverables, §14 user data location.
 */
export async function maybePromptForMaestroProject(opts: {
  httpBase: string;
  parentWindow?: BrowserWindow;
}): Promise<void> {
  const current = await readCurrentProject(opts.httpBase);
  if (current) return;

  const result = await dialog.showOpenDialog(opts.parentWindow!, {
    title: 'Pick your Maestro project folder',
    message: 'ManualFlow needs a folder to read and write your Maestro flows. You can change this later in settings.',
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || !result.filePaths[0]) return;
  await postProject(opts.httpBase, result.filePaths[0]);
}

async function readCurrentProject(httpBase: string): Promise<string | null> {
  try {
    const r = await fetch(`${httpBase}/api/maestro/project`);
    if (!r.ok) return null;
    const body: { project: { rootPath?: string } | null } = await r.json();
    return body.project?.rootPath ?? null;
  } catch {
    return null;
  }
}

async function postProject(httpBase: string, folderPath: string): Promise<void> {
  try {
    await fetch(`${httpBase}/api/maestro/project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath }),
    });
  } catch {
    // Non-fatal: the user can configure later from inside the dashboard.
  }
}
