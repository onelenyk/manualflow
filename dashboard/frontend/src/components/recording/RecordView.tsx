import { useState } from 'react';
import { ScreenMirror } from '../device/ScreenMirror';
import { RecordingControls } from './RecordingControls';
import { ActionFeed } from './ActionFeed';
import { useRecordingStore } from '../../stores/recordingStore';
import { api } from '../../api/client';

export function RecordView() {
  const { yaml, error, commands } = useRecordingStore();
  const [copied, setCopied] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: any[] } | null>(null);

  const handleCopy = async () => {
    if (!yaml) return;
    await navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleValidate = async () => {
    if (!yaml) return;
    setValidating(true);
    try {
      const result = await api.validateYaml(yaml);
      setValidationResult(result);
    } catch {
      setValidationResult({ valid: false, errors: [{ message: 'Validation request failed' }] });
    }
    setValidating(false);
  };

  return (
    <div className="flex h-full gap-4">
      {/* Left: Device panel */}
      <div className="flex flex-col min-h-0 w-[320px] shrink-0">
        <ScreenMirror />
      </div>

      {/* Right: Recording controls + Actions + YAML */}
      <div className="flex flex-col flex-1 gap-3 min-h-0">
        {/* Recording controls */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Record Flow</h2>
            <RecordingControls />
          </div>
          {error && (
            <div className="mt-2 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Actions feed */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Actions {commands.length > 0 && <span className="text-slate-600">({commands.length})</span>}
            </h3>
          </div>
          <div className="flex-1 overflow-auto">
            <ActionFeed />
          </div>
        </div>

        {/* YAML output */}
        {yaml && (
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Generated YAML</h3>
              <div className="flex gap-2">
                <button
                  onClick={handleValidate}
                  disabled={validating}
                  className="px-2.5 py-1 text-[10px] font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-md transition-all"
                >
                  {validating ? 'Checking...' : 'Validate'}
                </button>
                <button
                  onClick={handleCopy}
                  className="px-2.5 py-1 text-[10px] font-medium bg-slate-700 hover:bg-slate-600 text-white rounded-md transition-all"
                >
                  {copied ? 'Copied!' : 'Copy YAML'}
                </button>
              </div>
            </div>

            {/* Validation result */}
            {validationResult && (
              <div className={`mb-2 text-[11px] px-3 py-1.5 rounded-lg ${
                validationResult.valid
                  ? 'text-green-400 bg-green-400/10'
                  : 'text-red-400 bg-red-400/10'
              }`}>
                {validationResult.valid
                  ? 'Valid Maestro YAML'
                  : validationResult.errors.map((e: any, i: number) => (
                      <div key={i}>{e.message || `${e.command}: ${e.field} — ${e.message}`}</div>
                    ))
                }
              </div>
            )}

            <pre className="bg-slate-950 rounded-lg p-3 text-[11px] text-green-400 overflow-auto max-h-48 font-mono leading-relaxed select-all">
              {yaml}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
