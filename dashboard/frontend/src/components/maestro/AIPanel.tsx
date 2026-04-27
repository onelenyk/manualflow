import { useState } from 'react';
import { api } from '../../api/client';
import { useMaestroEditorStore } from '../../stores/maestroEditorStore';
import { useMaestroProjectStore } from '../../stores/maestroProjectStore';
import { DiffPreviewModal } from './DiffPreviewModal';
import { ExtractReviewScreen, type ExtractRefactor, type ExtractSubflow } from './ExtractReviewScreen';

type ActiveOp =
  | 'prettify'
  | 'verify-yaml'
  | 'verify-flow'
  | 'extract-common'
  | 'create'
  | null;

interface VerifyYamlResult {
  ok: boolean;
  errors: { line?: number; col?: number; message: string; code: string }[];
  warnings: string[];
}

interface VerifyFlowResult {
  deterministic: VerifyYamlResult;
  semantic: { ok: boolean; notes: string[]; suggestions: string[] } | null;
}

interface PrettifyState {
  before: string;
  after: string;
  changesSummary: string;
}

const APP_ID_RX = /^[a-z][\w.]+$/;

function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

export function AIPanel() {
  const yaml = useMaestroEditorStore((s) => s.yaml);
  const setBuffer = useMaestroEditorStore((s) => s.setBuffer);
  const putDraftDebounced = useMaestroEditorStore((s) => s.putDraftDebounced);
  const project = useMaestroProjectStore((s) => s.project);
  const refresh = useMaestroProjectStore((s) => s.refresh);
  const selectFile = useMaestroProjectStore((s) => s.selectFile);

  const [activeOp, setActiveOp] = useState<ActiveOp>(null);
  const [busy, setBusy] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  // prettify
  const [prettify, setPrettify] = useState<PrettifyState | null>(null);

  // verify-yaml
  const [yamlVerify, setYamlVerify] = useState<VerifyYamlResult | null>(null);

  // verify-flow
  const [flowVerify, setFlowVerify] = useState<VerifyFlowResult | null>(null);

  // extract-common
  const [extractStage, setExtractStage] = useState<'confirm' | 'review' | null>(null);
  const [extractFlowsCount, setExtractFlowsCount] = useState(0);
  const [extractTotalChars, setExtractTotalChars] = useState(0);
  const [extractFetched, setExtractFetched] = useState<{ path: string; yaml: string }[] | null>(null);
  const [extractResult, setExtractResult] = useState<
    { subflows: ExtractSubflow[]; refactors: ExtractRefactor[] } | null
  >(null);

  // create-from-prompt
  const [prompt, setPrompt] = useState('');
  const [appIdInput, setAppIdInput] = useState('');
  const [appIdErr, setAppIdErr] = useState<string | null>(null);

  const yamlEmpty = !yaml || yaml.trim().length === 0;
  const projectAppId = project?.rules?.parsed?.appId;
  const flowFiles = project?.files?.filter((f) => f.kind === 'flow') ?? [];

  function toggle(op: ActiveOp) {
    setOpError(null);
    if (activeOp === op) {
      setActiveOp(null);
    } else {
      setActiveOp(op);
    }
  }

  async function runPrettify() {
    if (yamlEmpty) return;
    setBusy(true);
    setOpError(null);
    try {
      const res = await api.aiPrettifyFlow(yaml);
      setPrettify({ before: yaml, after: res.yaml, changesSummary: res.changesSummary });
    } catch (e: any) {
      setOpError(e?.message ?? 'Prettify failed');
    } finally {
      setBusy(false);
    }
  }

  function acceptPrettify() {
    if (!prettify) return;
    setBuffer(prettify.after);
    putDraftDebounced();
    setPrettify(null);
  }

  function rejectPrettify() {
    setPrettify(null);
  }

  async function runVerifyYaml() {
    if (yamlEmpty) return;
    setBusy(true);
    setOpError(null);
    try {
      const res = await api.aiVerifyYaml(yaml);
      setYamlVerify(res);
    } catch (e: any) {
      setOpError(e?.message ?? 'Verify YAML failed');
    } finally {
      setBusy(false);
    }
  }

  async function runVerifyFlow() {
    if (yamlEmpty) return;
    setBusy(true);
    setOpError(null);
    try {
      const res = await api.aiVerifyFlow(yaml);
      setFlowVerify(res);
    } catch (e: any) {
      setOpError(e?.message ?? 'Verify Flow failed');
    } finally {
      setBusy(false);
    }
  }

  async function openExtractCommonConfirm() {
    if (!project) return;
    setBusy(true);
    setOpError(null);
    setExtractFetched(null);
    setExtractResult(null);
    try {
      const sortedFlows = [...flowFiles]
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
        .slice(0, 30);

      const fetched = await Promise.all(
        sortedFlows.map(async (f) => {
          const r = await api.getMaestroFlow(f.path);
          return { path: f.path, yaml: r.yaml };
        }),
      );
      const totalChars = fetched.reduce((acc, f) => acc + f.yaml.length, 0);
      setExtractFetched(fetched);
      setExtractFlowsCount(fetched.length);
      setExtractTotalChars(totalChars);
      setExtractStage('confirm');
    } catch (e: any) {
      setOpError(e?.message ?? 'Failed to load flows');
      setExtractStage(null);
    } finally {
      setBusy(false);
    }
  }

  async function runExtractCommon() {
    if (!extractFetched) return;
    setBusy(true);
    setOpError(null);
    try {
      const res = await api.aiExtractCommon(extractFetched);
      setExtractResult(res);
      setExtractStage('review');
    } catch (e: any) {
      setOpError(e?.message ?? 'Extract failed');
      setExtractStage(null);
    } finally {
      setBusy(false);
    }
  }

  async function applyExtract({
    selectedSubflows,
    selectedRefactors,
  }: {
    selectedSubflows: ExtractSubflow[];
    selectedRefactors: ExtractRefactor[];
  }) {
    if (!project) return;
    const errors: string[] = [];

    for (const sf of selectedSubflows) {
      const path = `${project.maestroDir}/${sf.name}.yaml`;
      try {
        await api.saveMaestroFlow({ path, yaml: sf.yaml, overwrite: false });
      } catch (e: any) {
        errors.push(`${sf.name}.yaml: ${e?.message ?? 'save failed'}`);
      }
    }

    for (const rf of selectedRefactors) {
      try {
        await api.putMaestroDraft(rf.flowPath, rf.after);
      } catch (e: any) {
        errors.push(`${rf.flowPath}: ${e?.message ?? 'draft failed'}`);
      }
    }

    await refresh();

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }

    setExtractStage(null);
    setExtractResult(null);
    setExtractFetched(null);
    setActiveOp(null);
  }

  function cancelExtract() {
    setExtractStage(null);
    setExtractResult(null);
    setExtractFetched(null);
  }

  async function submitCreate() {
    setOpError(null);
    setAppIdErr(null);

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setOpError('Prompt is required');
      return;
    }
    if (trimmedPrompt.length > 4096) {
      setOpError('Prompt is too long (max 4096 chars)');
      return;
    }

    const trimmedAppId = appIdInput.trim();
    const effectiveAppId = trimmedAppId || projectAppId;
    if (!effectiveAppId) {
      setAppIdErr('appId is required (project rules have none)');
      return;
    }
    if (trimmedAppId && !APP_ID_RX.test(trimmedAppId)) {
      setAppIdErr('appId must match ^[a-z][\\w.]+$');
      return;
    }

    setBusy(true);
    try {
      const res = await api.aiCreateFromPrompt({
        prompt: trimmedPrompt,
        appId: trimmedAppId || undefined,
      });
      await refresh();
      selectFile(res.draftPath);
      setPrompt('');
      setAppIdInput('');
      setActiveOp(null);
    } catch (e: any) {
      setOpError(e?.message ?? 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800 flex flex-col">
      <div className="px-3 py-2 border-b border-slate-800 shrink-0">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI</h3>
      </div>

      <div className="p-3 flex flex-wrap gap-2 shrink-0">
        <OpButton
          label="Prettify"
          active={activeOp === 'prettify'}
          disabled={yamlEmpty || busy}
          onClick={() => toggle('prettify')}
        />
        <OpButton
          label="Verify YAML"
          active={activeOp === 'verify-yaml'}
          disabled={yamlEmpty || busy}
          onClick={() => toggle('verify-yaml')}
        />
        <OpButton
          label="Verify Flow"
          active={activeOp === 'verify-flow'}
          disabled={yamlEmpty || busy}
          onClick={() => toggle('verify-flow')}
        />
        <OpButton
          label="Extract Common"
          active={activeOp === 'extract-common'}
          disabled={!project || flowFiles.length === 0 || busy}
          onClick={() => toggle('extract-common')}
        />
        <OpButton
          label="Create From Prompt"
          active={activeOp === 'create'}
          disabled={busy}
          onClick={() => toggle('create')}
        />
      </div>

      {opError && (
        <div className="mx-3 mb-3 text-xs text-red-300 bg-red-900/30 border border-red-800/40 rounded px-3 py-2">
          {opError}
        </div>
      )}

      {activeOp === 'prettify' && (
        <div className="px-3 pb-3">
          <button
            onClick={runPrettify}
            disabled={yamlEmpty || busy}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
          >
            {busy ? 'Working...' : 'Run Prettify'}
          </button>
          <p className="text-[11px] text-slate-500 mt-2">
            Returns a cleaned-up version of the current buffer for review.
          </p>
        </div>
      )}

      {activeOp === 'verify-yaml' && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          <button
            onClick={runVerifyYaml}
            disabled={yamlEmpty || busy}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors self-start"
          >
            {busy ? 'Verifying...' : 'Run Verify YAML'}
          </button>
          {yamlVerify && <VerifyYamlReport result={yamlVerify} />}
        </div>
      )}

      {activeOp === 'verify-flow' && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          <button
            onClick={runVerifyFlow}
            disabled={yamlEmpty || busy}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors self-start"
          >
            {busy ? 'Verifying...' : 'Run Verify Flow'}
          </button>
          {flowVerify && (
            <div className="flex flex-col gap-3">
              <section className="bg-slate-950 border border-slate-800 rounded p-2">
                <div className="text-xs font-semibold text-slate-300 mb-1">Deterministic</div>
                <VerifyYamlReport result={flowVerify.deterministic} />
              </section>
              <section className="bg-slate-950 border border-slate-800 rounded p-2">
                <div className="text-xs font-semibold text-slate-300 mb-1">Semantic</div>
                {flowVerify.semantic === null ? (
                  <div className="text-xs text-slate-500">Skipped — fix YAML first</div>
                ) : (
                  <SemanticReport semantic={flowVerify.semantic} />
                )}
              </section>
            </div>
          )}
        </div>
      )}

      {activeOp === 'extract-common' && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          <button
            onClick={openExtractCommonConfirm}
            disabled={!project || flowFiles.length === 0 || busy}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors self-start"
          >
            {busy ? 'Loading flows...' : 'Open Extract Common'}
          </button>
          <p className="text-[11px] text-slate-500">
            Scans up to 30 project flows for common subflows.
          </p>
        </div>
      )}

      {activeOp === 'create' && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          <label className="text-xs text-slate-400 flex flex-col gap-1">
            <span>Prompt</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={4096}
              rows={4}
              spellCheck={false}
              placeholder="Describe the flow you want to create..."
              className="font-mono text-xs bg-slate-950 text-slate-200 p-2 rounded resize-none focus:outline-none border border-slate-800 focus:border-blue-500"
            />
            <span className="text-[10px] text-slate-500">{prompt.length}/4096</span>
          </label>

          <label className="text-xs text-slate-400 flex flex-col gap-1">
            <span>
              appId{' '}
              {projectAppId ? (
                <span className="text-slate-500">(project default: {projectAppId})</span>
              ) : (
                <span className="text-amber-400">(required — project has none)</span>
              )}
            </span>
            <input
              type="text"
              value={appIdInput}
              onChange={(e) => setAppIdInput(e.target.value)}
              placeholder={projectAppId ?? 'com.example.app'}
              className="text-xs bg-slate-950 text-slate-200 px-2 py-1.5 rounded focus:outline-none border border-slate-800 focus:border-blue-500"
            />
            {appIdErr && <span className="text-[11px] text-red-300">{appIdErr}</span>}
          </label>

          <div className="flex gap-2">
            <button
              onClick={submitCreate}
              disabled={busy || prompt.trim().length === 0}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
            >
              {busy ? 'Creating...' : 'Submit'}
            </button>
            <button
              onClick={() => {
                setActiveOp(null);
                setPrompt('');
                setAppIdInput('');
                setAppIdErr(null);
              }}
              disabled={busy}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {prettify && (
        <DiffPreviewModal
          beforeYaml={prettify.before}
          afterYaml={prettify.after}
          changesSummary={prettify.changesSummary}
          onAccept={acceptPrettify}
          onReject={rejectPrettify}
        />
      )}

      {extractStage === 'confirm' && (
        <ExtractConfirmModal
          flowsCount={extractFlowsCount}
          totalChars={extractTotalChars}
          busy={busy}
          onCancel={cancelExtract}
          onContinue={runExtractCommon}
        />
      )}

      {extractStage === 'review' && extractResult && (
        <ExtractReviewScreen
          subflows={extractResult.subflows}
          refactors={extractResult.refactors}
          onApply={applyExtract}
          onCancel={cancelExtract}
        />
      )}
    </div>
  );
}

function OpButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

function VerifyYamlReport({ result }: { result: VerifyYamlResult }) {
  const hasIssues = result.errors.length > 0 || result.warnings.length > 0;
  if (result.ok && !hasIssues) {
    return <div className="text-xs text-green-300">YAML structure looks valid</div>;
  }
  return (
    <div className="flex flex-col gap-1">
      {result.errors.map((err, i) => (
        <div key={`e${i}`} className="text-xs text-red-300 font-mono">
          {err.line !== undefined ? `Line ${err.line}` : 'Line ?'}
          {err.col !== undefined ? `:${err.col}` : ''} — {err.message} ({err.code})
        </div>
      ))}
      {result.warnings.map((w, i) => (
        <div key={`w${i}`} className="text-xs text-amber-300">
          {w}
        </div>
      ))}
      {result.ok && hasIssues && (
        <div className="text-xs text-green-300 mt-1">YAML structure looks valid</div>
      )}
    </div>
  );
}

function SemanticReport({
  semantic,
}: {
  semantic: { ok: boolean; notes: string[]; suggestions: string[] };
}) {
  if (semantic.notes.length === 0 && semantic.suggestions.length === 0) {
    return (
      <div className="text-xs text-slate-400">
        {semantic.ok ? 'No semantic issues found.' : 'Semantic check returned no details.'}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {semantic.notes.length > 0 && (
        <div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Notes</div>
          <ul className="list-disc list-inside text-xs text-slate-300 space-y-0.5">
            {semantic.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      {semantic.suggestions.length > 0 && (
        <div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">
            Suggestions
          </div>
          <ul className="list-disc list-inside text-xs text-slate-300 space-y-0.5">
            {semantic.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ExtractConfirmModal({
  flowsCount,
  totalChars,
  busy,
  onCancel,
  onContinue,
}: {
  flowsCount: number;
  totalChars: number;
  busy: boolean;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const tokens = estimateTokens(totalChars);
  const kb = (totalChars / 1024).toFixed(1);
  const heavy = tokens > 10000;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-white">Extract common subflows</h3>
        <div className="text-xs text-slate-300">
          Extract common subflows from {flowsCount} flow{flowsCount === 1 ? '' : 's'} ({kb}KB →
          ~{tokens.toLocaleString()} tokens). Continue?
        </div>
        {heavy && (
          <div className="text-[11px] text-amber-300 bg-amber-900/30 border border-amber-800/40 rounded px-2 py-1">
            Heavy request: above 10,000 tokens.
          </div>
        )}
        <div className="flex justify-end gap-2 mt-1">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onContinue}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
          >
            {busy ? 'Working...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
