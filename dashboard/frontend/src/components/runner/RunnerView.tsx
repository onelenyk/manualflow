import { useState } from 'react';
import { api } from '../../api/client';

interface ValidationError {
  index: number;
  command: string;
  field: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function RunnerView() {
  const [yaml, setYaml] = useState('');
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handleValidate = async () => {
    if (!yaml.trim()) return;
    setValidating(true);
    try {
      const res = await api.validateYaml(yaml);
      setResult(res);
    } catch (err) {
      setResult({
        valid: false,
        errors: [
          {
            index: -1,
            command: 'validation',
            field: 'request',
            message: err instanceof Error ? err.message : 'Validation request failed',
          },
        ],
      });
    }
    setValidating(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(yaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleClear = () => {
    setYaml('');
    setResult(null);
  };

  return (
    <div className="flex flex-col gap-4 h-full p-4">
      {/* Header */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
        <h1 className="text-sm font-semibold text-white mb-2">YAML Validator</h1>
        <p className="text-xs text-slate-400">
          Paste or edit Maestro YAML commands and click Validate to check for errors.
        </p>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col min-h-0 bg-slate-900/60 rounded-xl border border-slate-800 p-4">
        <textarea
          value={yaml}
          onChange={(e) => {
            setYaml(e.target.value);
            setResult(null);
          }}
          placeholder="Paste your Maestro YAML here to validate..."
          className="flex-1 bg-slate-950 rounded-lg p-3 text-[11px] text-green-400 font-mono leading-relaxed resize-none outline-none border border-slate-800 focus:border-blue-500/50 placeholder-slate-700 min-h-[200px]"
          spellCheck={false}
        />

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-4 shrink-0">
          <button
            onClick={handleValidate}
            disabled={validating || !yaml.trim()}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-all"
          >
            {validating ? 'Validating...' : 'Validate'}
          </button>
          <button
            onClick={handleCopy}
            disabled={!yaml.trim()}
            className="px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-all"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleClear}
            disabled={!yaml}
            className="px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-all"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Validation results */}
      {result && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
          {result.valid ? (
            <div className="flex items-center gap-2">
              <span className="text-xl">✓</span>
              <span className="text-xs font-semibold text-green-400">Valid Maestro YAML</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-red-400 font-semibold">
                {result.errors.length} validation error{result.errors.length !== 1 ? 's' : ''}
              </div>
              {result.errors.map((err, i) => (
                <div
                  key={i}
                  className="text-[11px] bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2.5"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-red-500 font-semibold shrink-0">
                      {err.index >= 0 ? `[${err.index}]` : 'Error'}
                    </span>
                    <div className="flex-1">
                      <div className="text-red-400">
                        {err.command}: <span className="font-mono text-red-300">{err.field}</span>
                      </div>
                      <div className="text-red-300 mt-1">{err.message}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
