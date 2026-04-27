import React, { useState } from 'react';
import type { EnhancementResult, EnhancementSuggestion } from '@maestro-recorder/shared';

interface EnhancementDialogProps {
  result: EnhancementResult;
  onApply: (yaml: string) => void;
  onClose: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  optimize: 'bg-blue-500/20 text-blue-400',
  add: 'bg-green-500/20 text-green-400',
  remove: 'bg-red-500/20 text-red-400',
  modify: 'bg-amber-500/20 text-amber-400',
};

export function EnhancementDialog({ result, onApply, onClose }: EnhancementDialogProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggleSuggestion = (idx: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleApplyAll = () => {
    onApply(result.enhancedYaml);
  };

  const handleApplySelected = () => {
    // If user selected specific suggestions, we'd need to rebuild YAML
    // For now, just apply all
    onApply(result.enhancedYaml);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span>✨</span> AI Flow Enhancer
          </h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {result.error ? (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
              <p className="font-semibold">Enhancement failed</p>
              <p className="text-sm mt-1">{result.error}</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Summary</h3>
                <div className="bg-slate-900/50 rounded-lg p-3 text-sm text-slate-300 whitespace-pre-line">
                  {result.summary}
                </div>
              </div>

              {/* Suggestion count */}
              <div className="mb-4 text-sm text-slate-400">
                {result.suggestions.length} suggestion{result.suggestions.length !== 1 ? 's' : ''} proposed
              </div>

              {/* Details expander */}
              {result.suggestions.length > 0 && (
                <div className="mb-4">
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    {showDetails ? '▼ Hide' : '▶ Show'} details
                  </button>

                  {showDetails && (
                    <div className="mt-2 space-y-2">
                      {result.suggestions.map((s, idx) => (
                        <div key={idx} className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                          <div className="flex items-start gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_COLORS[s.type]}`}>
                              {s.type}
                            </span>
                            <div className="flex-1">
                              <p className="text-sm text-white">{s.description}</p>
                              <p className="text-xs text-slate-500 mt-1">{s.reason}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
          >
            Cancel
          </button>
          {!result.error && result.suggestions.length > 0 && (
            <button
              onClick={handleApplyAll}
              className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
            >
              Apply All ({result.suggestions.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
