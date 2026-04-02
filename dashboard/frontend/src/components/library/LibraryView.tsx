import { useState, useEffect } from 'react';
import { api } from '../../api/client';

interface Template {
  id: string;
  name: string;
  description: string;
  category: 'auth' | 'navigation' | 'forms' | 'lists' | 'search' | 'common';
  yaml: string;
}

type Category = 'all' | 'auth' | 'navigation' | 'forms' | 'lists' | 'search';

const CATEGORIES: Category[] = ['all', 'auth', 'navigation', 'forms', 'lists', 'search'];

const CATEGORY_COLORS: Record<string, string> = {
  auth: 'text-purple-400 bg-purple-400/10',
  navigation: 'text-blue-400 bg-blue-400/10',
  forms: 'text-amber-400 bg-amber-400/10',
  lists: 'text-indigo-400 bg-indigo-400/10',
  search: 'text-teal-400 bg-teal-400/10',
  common: 'text-slate-400 bg-slate-400/10',
};

const CATEGORY_DISPLAY: Record<string, string> = {
  all: 'All',
  auth: 'Auth',
  navigation: 'Navigation',
  forms: 'Forms',
  lists: 'Lists',
  search: 'Search',
};

export function LibraryView() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getTemplates();
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = selectedCategory === 'all'
    ? templates
    : templates.filter(t => t.category === selectedCategory);

  const handleCopyYaml = async (id: string, yaml: string) => {
    try {
      await navigator.clipboard.writeText(yaml);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy YAML:', err);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      {/* Header */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
        <h1 className="text-sm font-semibold text-white mb-3">Template Library</h1>
        <p className="text-xs text-slate-400 mb-4">
          Browse and copy Maestro test flow templates. Click a card to expand and view the YAML.
        </p>

        {/* Category filters */}
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                selectedCategory === cat
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {CATEGORY_DISPLAY[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-slate-400 text-xs">Loading templates...</div>
        </div>
      )}

      {error && (
        <div className="bg-red-400/10 border border-red-400/20 rounded-xl p-4">
          <p className="text-xs text-red-400 mb-3">{error}</p>
          <button
            onClick={fetchTemplates}
            className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && filteredTemplates.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-slate-600 text-xs">No templates in this category</div>
        </div>
      )}

      {!loading && !error && filteredTemplates.length > 0 && (
        <div className="grid grid-cols-2 gap-3 flex-1 overflow-auto">
          {filteredTemplates.map(template => (
            <div
              key={template.id}
              className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden flex flex-col hover:border-slate-700 transition-all"
            >
              {/* Collapsed view */}
              <div
                onClick={() => setExpandedId(expandedId === template.id ? null : template.id)}
                className="p-4 flex-1 cursor-pointer hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-white">{template.name}</h3>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap shrink-0 ${
                      CATEGORY_COLORS[template.category]
                    }`}
                  >
                    {CATEGORY_DISPLAY[template.category]}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{template.description}</p>
              </div>

              {/* Expanded YAML view */}
              {expandedId === template.id && (
                <div className="bg-slate-950/50 border-t border-slate-800 p-3 space-y-3">
                  <pre className="bg-slate-950 rounded-lg p-3 text-[11px] text-green-400 overflow-auto max-h-64 font-mono leading-relaxed whitespace-pre-wrap break-words">
                    {template.yaml}
                  </pre>
                  <button
                    onClick={() => handleCopyYaml(template.id, template.yaml)}
                    className="w-full px-2.5 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all"
                  >
                    {copied === template.id ? 'Copied!' : 'Copy YAML'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
