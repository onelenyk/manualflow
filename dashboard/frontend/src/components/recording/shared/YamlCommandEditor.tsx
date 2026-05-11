import { useState, useEffect, useRef } from 'react';
import type { MaestroCommand } from '@maestro-recorder/shared';
import { formatCommandShort, parseCommandLines } from '@maestro-recorder/shared';
import type { FlowEntry } from '../../../stores/liveFlowStore';

export interface YamlCommandEditorProps {
  entries: FlowEntry[];
  onRemap: (commands: MaestroCommand[]) => void;
  readOnly?: boolean;
  /** Optional: notified when the textarea gains/loses focus.
      Parent uses this to suppress auto-scroll while editing. */
  onFocusChange?: (focused: boolean) => void;
}

function entriesToYaml(entries: FlowEntry[]): string {
  return entries.map(e => formatCommandShort(e.command)).join('\n');
}

export function YamlCommandEditor({
  entries,
  onRemap,
  readOnly = false,
  onFocusChange,
}: YamlCommandEditorProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  // Draft text is seeded from entries when entering edit mode; not updated while editing.
  const [draft, setDraft] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When not editing and entries change, the rendered output updates automatically
  // because we derive the display text directly from entries in render mode.
  // The draft is only used in edit mode.

  // Auto-focus textarea when entering edit mode.
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editing]);

  const renderedYaml = entriesToYaml(entries);

  function enterEditMode() {
    if (readOnly || entries.length === 0) return;
    setDraft(renderedYaml);
    setEditing(true);
    setParseError(null);
  }

  function commit() {
    const parsed = parseCommandLines(draft);
    if (parsed.length > 0) {
      onRemap(parsed);
      setParseError(null);
      setEditing(false);
    } else {
      // Keep prior commands, exit edit mode, show inline error.
      setEditing(false);
      setParseError('Could not parse YAML');
    }
  }

  function cancel() {
    setEditing(false);
    setDraft('');
    setParseError(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      cancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
  }

  function handleBlur() {
    onFocusChange?.(false);
    commit();
  }

  function handleFocus() {
    onFocusChange?.(true);
  }

  const isEmpty = entries.length === 0;
  const isClickable = !readOnly && !isEmpty;

  if (editing) {
    return (
      <div>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="w-full bg-slate-900 border border-blue-500/60 rounded px-2 py-1 font-mono text-[11px] text-slate-100 outline-none resize-y"
          style={{ minHeight: '4.5em' }}
          rows={Math.max(3, entries.length)}
        />
      </div>
    );
  }

  return (
    <div>
      <div
        className={[
          'rounded bg-slate-800/40 px-2 py-1 font-mono text-[11px] text-slate-300 whitespace-pre-wrap',
          isClickable ? 'hover:bg-slate-700/40 cursor-pointer' : '',
        ].join(' ')}
        onClick={isClickable ? enterEditMode : undefined}
        title={isClickable ? 'Click to edit' : undefined}
      >
        {isEmpty ? (
          <span className="text-slate-600 italic">(no commands)</span>
        ) : (
          renderedYaml
        )}
      </div>
      {parseError && (
        <div
          className="text-[10px] text-red-400 mt-1 cursor-pointer"
          onClick={() => {
            setParseError(null);
            if (!readOnly && !isEmpty) {
              enterEditMode();
            }
          }}
          title="Click to dismiss or re-enter edit mode"
        >
          {parseError}
        </div>
      )}
    </div>
  );
}
