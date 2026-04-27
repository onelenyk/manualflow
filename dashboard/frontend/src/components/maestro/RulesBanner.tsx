import type { MaestroRules } from '@maestro-recorder/shared';

interface RulesBannerProps {
  rules: MaestroRules;
  onOpenConfig?: () => void;
}

export function RulesBanner({ rules, onOpenConfig }: RulesBannerProps) {
  if (rules.parseError) {
    return (
      <div className="bg-red-900/40 border border-red-800 rounded-lg px-3 py-2 text-xs text-red-300 flex items-center justify-between gap-2">
        <span>config.yaml parse error: {rules.parseError}</span>
        <button
          onClick={onOpenConfig}
          className="shrink-0 text-xs text-red-200 hover:text-white underline transition-colors"
        >
          Open file
        </button>
      </div>
    );
  }

  if (!rules.present) {
    return (
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-400">
        No config.yaml — running is ad-hoc.
      </div>
    );
  }

  const p = rules.parsed;
  if (!p) return null;

  const chips: string[] = [];

  if (p.executionOrder) chips.push('executionOrder');
  if (p.tags && p.tags.length > 0) chips.push(`tags: ${p.tags.join(', ')}`);
  if (p.includeTags && p.includeTags.length > 0) chips.push(`includeTags: ${p.includeTags.join(', ')}`);
  if (p.excludeTags && p.excludeTags.length > 0) chips.push(`excludeTags: ${p.excludeTags.join(', ')}`);
  if (p.env && Object.keys(p.env).length > 0) chips.push(`env keys: ${Object.keys(p.env).join(', ')}`);
  if (p.appId) chips.push(`appId: ${p.appId}`);
  if (p.flows && p.flows.length > 0) chips.push(`Suite restricted to: ${p.flows.length} flows`);

  if (chips.length === 0) return null;

  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-lg px-3 py-2 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <span
          key={chip}
          className="text-xs bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded"
        >
          {chip}
        </span>
      ))}
    </div>
  );
}
