import { useState, useEffect } from 'react';
import { api } from '../../api/client';

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  yaml: string;
}

const categories = ['all', 'auth', 'navigation', 'forms', 'lists', 'search'];

const categoryColors: Record<string, string> = {
  auth: 'text-purple-400 bg-purple-400/10',
  navigation: 'text-blue-400 bg-blue-400/10',
  forms: 'text-amber-400 bg-amber-400/10',
  lists: 'text-teal-400 bg-teal-400/10',
  search: 'text-green-400 bg-green-400/10',
  common: 'text-slate-400 bg-slate-400/10',
};

export function LibraryView() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api.getTemplates().then(setTemplates).catch(() => {});
  }, []);

  const filtered = filter === 'all' ? templates : templates.filter(t => t.category === filter);

  const handleCopy = async (id: string, yaml: string) => {
    await navigator.clipboard.writeText(yaml);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-white">Template Library</h2>
        <div className="flex gap-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all capitalize ${
                filter === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(t => (
            <div key={t.id} className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-white">{t.name}</h3>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${categoryColors[t.category] || categoryColors.common}`}>
                    {t.category}
                  </span>
                </div>
                <button
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  className="text-[10px] text-slate-500 hover:text-white"
                >
                  {expanded === t.id ? 'Hide' : 'Show YAML'}
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-3">{t.description}</p>

              {expanded === t.id && (
                <div className="mt-2">
                  <div className="flex justify-end mb-1">
                    <button
                      onClick={() => handleCopy(t.id, t.yaml)}
                      className="px-2 py-0.5 text-[10px] font-medium bg-slate-700 hover:bg-slate-600 text-white rounded transition-all"
                    >
                      {copied === t.id ? 'Copied!' : 'Copy YAML'}
                    </button>
                  </div>
                  <pre className="bg-slate-950 rounded-lg p-3 text-[11px] text-green-400 overflow-auto max-h-64 font-mono leading-relaxed">
                    {t.yaml}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-slate-600 text-xs text-center py-12">No templates in this category</div>
        )}
      </div>
    </div>
  );
}
