import { useEffect, useState } from 'react';
import { useLiveFlowStore } from '../../stores/liveFlowStore';
import { useEnhancementStore } from '../../stores/enhancementStore';
import { getAiStatus, type AiStatus } from '../../api/ai';

export function AIEnhancePanel() {
  const { entries, getYaml, applyEnhanced, clear: clearEntries } = useLiveFlowStore();
  const { isEnhancing, currentResult, error, enhanceFlow, clear: clearEnhancement } = useEnhancementStore();
  const [showYaml, setShowYaml] = useState(false);
  const [applied, setApplied] = useState<{ count: number } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    let live = true;
    getAiStatus()
      .then(s => { if (live) setAiStatus(s); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const handleEnhance = async () => {
    setApplied(null);
    setApplyError(null);
    const yaml = getYaml();
    await enhanceFlow(yaml);
  };

  const handleApply = () => {
    if (!currentResult?.enhancedYaml) return;
    const result = applyEnhanced(currentResult.enhancedYaml);
    if (!result.ok) {
      setApplyError(result.error || 'Apply failed');
      return;
    }
    setApplied({ count: result.commandCount });
    setApplyError(null);
  };

  const handleCopy = async () => {
    if (!currentResult?.enhancedYaml) return;
    try {
      await navigator.clipboard.writeText(currentResult.enhancedYaml);
    } catch {
      // ignore
    }
  };

  const handleReset = () => {
    clearEnhancement();
    setApplied(null);
    setApplyError(null);
  };

  const hasFlow = entries.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">{'✨'}</span>
          <h2 className="text-[11px] font-semibold text-white">AI Enhance</h2>
        </div>
        {currentResult && (
          <button onClick={handleReset} className="text-[10px] text-slate-500 hover:text-white">
            Reset
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-500 mb-3 shrink-0 leading-snug">
        Analyzes your flow, removes duplicates, prefers stable id selectors, and folds
        keyboard tap + key sequences into a single <code className="text-slate-400">inputText</code>.
      </p>

      {aiStatus && !aiStatus.configured && (
        <div className="mb-3 text-[11px] text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-lg px-2 py-1.5 shrink-0 leading-snug">
          OpenRouter not configured — set <code className="text-slate-200">{aiStatus.missing.join(', ')}</code> and restart the server.
        </div>
      )}

      <button
        onClick={handleEnhance}
        disabled={!hasFlow || isEnhancing || (aiStatus !== null && !aiStatus.configured)}
        className="px-3 py-2 text-xs font-medium bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2 shrink-0"
      >
        {isEnhancing ? (
          <>
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Analyzing flow...
          </>
        ) : (
          <>{'✨'} Enhance flow ({entries.length} cmds)</>
        )}
      </button>

      {!hasFlow && (
        <p className="text-[10px] text-slate-600 italic mt-2 text-center shrink-0">
          Record some interactions first.
        </p>
      )}

      {error && !currentResult && (
        <div className="mt-3 text-[11px] text-red-400 bg-red-400/10 rounded-lg px-2 py-1.5 shrink-0">
          {error}
        </div>
      )}

      {currentResult && (
        <div className="mt-3 flex-1 min-h-0 overflow-auto">
          {currentResult.error ? (
            <div className="text-[11px] text-red-400 bg-red-400/10 rounded-lg p-2">
              {currentResult.error}
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="bg-slate-800/40 rounded-lg p-2 mb-2">
                <div className="text-[9px] text-purple-400 font-bold uppercase tracking-wider mb-1">Summary</div>
                <div className="text-[11px] text-slate-300 whitespace-pre-line leading-snug">
                  {currentResult.summary || 'No changes suggested.'}
                </div>
              </div>

              {/* Suggestions */}
              {currentResult.suggestions.length > 0 && (
                <div className="mb-2">
                  <div className="text-[9px] text-purple-400 font-bold uppercase tracking-wider mb-1">
                    Suggestions ({currentResult.suggestions.length})
                  </div>
                  <div className="flex flex-col gap-1">
                    {currentResult.suggestions.map((s, i) => (
                      <div key={i} className="bg-slate-800/40 rounded px-2 py-1.5">
                        <div className="flex items-start gap-1.5">
                          <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${SUGGESTION_COLOR[s.type] || 'bg-slate-600'}`}>
                            {s.type}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-slate-200 leading-snug">{s.description}</div>
                            {s.reason && (
                              <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{s.reason}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Enhanced YAML */}
              {currentResult.enhancedYaml && (
                <div className="mb-2">
                  <button
                    onClick={() => setShowYaml(!showYaml)}
                    className="text-[10px] text-slate-500 hover:text-white"
                  >
                    {showYaml ? '▼ Hide' : '▶ Show'} enhanced YAML
                  </button>
                  {showYaml && (
                    <pre className="mt-1 text-[10px] text-slate-300 bg-slate-950/60 rounded p-2 overflow-x-auto select-all font-mono">
                      {currentResult.enhancedYaml}
                    </pre>
                  )}
                </div>
              )}

              {/* Apply feedback */}
              {applied && (
                <div className="text-[10px] text-green-400 bg-green-400/10 rounded px-2 py-1 mb-1">
                  ✓ Replaced flow with {applied.count} command{applied.count === 1 ? '' : 's'}.
                </div>
              )}
              {applyError && (
                <div className="text-[10px] text-red-400 bg-red-400/10 rounded px-2 py-1 mb-1">
                  {applyError}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-1.5 sticky bottom-0 bg-slate-900/60 pt-2">
                <button
                  onClick={handleCopy}
                  className="flex-1 px-2 py-1 text-[11px] bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                >
                  Copy YAML
                </button>
                <button
                  onClick={handleApply}
                  disabled={applied !== null}
                  className="flex-1 px-2 py-1 text-[11px] bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded transition-colors"
                >
                  {applied ? 'Applied ✓' : 'Apply'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const SUGGESTION_COLOR: Record<string, string> = {
  optimize: 'bg-blue-500/30 text-blue-300',
  add: 'bg-green-500/30 text-green-300',
  remove: 'bg-red-500/30 text-red-300',
  modify: 'bg-amber-500/30 text-amber-300',
};
