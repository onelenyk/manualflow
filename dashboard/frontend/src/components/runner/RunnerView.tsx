import { useState } from 'react';
import { api } from '../../api/client';

export function RunnerView() {
  const [yaml, setYaml] = useState('');
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<{ valid: boolean; errors: any[] } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleValidate = async () => {
    if (!yaml.trim()) return;
    setValidating(true);
    try {
      const res = await api.validateYaml(yaml);
      setResult(res);
    } catch {
      setResult({ valid: false, errors: [{ message: 'Validation request failed' }] });
    }
    setValidating(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <h2 className="text-sm font-semibold text-white shrink-0">YAML Validator</h2>

      <div className="flex-1 flex flex-col min-h-0 bg-slate-900/60 rounded-xl border border-slate-800 p-4">
        <textarea
          value={yaml}
          onChange={e => { setYaml(e.target.value); setResult(null); }}
          placeholder="Paste your Maestro YAML here to validate..."
          className="flex-1 bg-slate-950 rounded-lg p-3 text-[11px] text-green-400 font-mono leading-relaxed resize-none outline-none border border-slate-800 focus:border-blue-500/50 placeholder-slate-700 min-h-[200px]"
          spellCheck={false}
        />

        <div className="flex items-center gap-2 mt-3">
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
            onClick={() => { setYaml(''); setResult(null); }}
            disabled={!yaml}
            className="px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-all"
          >
            Clear
          </button>

          <div className="ml-auto text-[10px] text-slate-600">
            <a href="https://docs.maestro.dev" target="_blank" rel="noopener" className="hover:text-blue-400 underline">
              Maestro Docs
            </a>
          </div>
        </div>
      </div>

      {/* Validation results */}
      {result && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
          {result.valid ? (
            <div className="flex items-center gap-2 text-green-400 text-xs">
              <span className="w-4 h-4 rounded-full bg-green-400/20 flex items-center justify-center text-[10px]">
                &#10003;
              </span>
              Valid Maestro YAML
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-red-400 font-semibold">
                {result.errors.length} validation error{result.errors.length !== 1 ? 's' : ''}
              </div>
              {result.errors.map((err: any, i: number) => (
                <div key={i} className="text-[11px] text-red-300 bg-red-400/10 rounded-lg px-3 py-2">
                  {err.index !== undefined && <span className="text-red-500 mr-1">#{err.index + 1}</span>}
                  {err.command && <span className="text-red-400 mr-1">{err.command}:</span>}
                  {err.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
