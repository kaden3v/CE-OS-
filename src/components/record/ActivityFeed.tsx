import { useState, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ActivityEntry = {
  id: string;
  kind: 'comment' | 'system';
  actor: { name: string; initials: string };
  /** ISO timestamp string. */
  at: string;
  /** For 'system': a short label like "set status to Shipped". For 'comment': the body. */
  text: string | ReactNode;
};

export function ActivityFeed({
  entries, onPostComment,
}: {
  entries: ActivityEntry[];
  onPostComment?: (text: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const submit = async () => {
    if (!draft.trim() || !onPostComment) return;
    setPosting(true);
    try { await onPostComment(draft.trim()); setDraft(''); }
    finally { setPosting(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <ol className="flex-1 overflow-y-auto px-1 py-2 space-y-3" aria-label="Activity feed">
        {[...entries].reverse().map(e => (
          <li key={e.id} className="flex gap-2 items-start">
            <span
              aria-hidden
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium flex-shrink-0 mt-0.5',
                e.kind === 'system' ? 'bg-bg-elevated text-text-tertiary' : 'bg-accent-brand text-bg-base',
              )}
            >
              {e.actor.initials}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-text-secondary">
                <span className="font-medium text-text-primary">{e.actor.name}</span>
                <span className="mx-1.5 text-text-tertiary">·</span>
                <time className="text-text-tertiary">{formatRelative(e.at)}</time>
              </div>
              <div className={cn(
                'mt-1 text-[13px]',
                e.kind === 'comment' ? 'text-text-primary' : 'text-text-secondary',
              )}>
                {e.text}
              </div>
            </div>
          </li>
        ))}
        {entries.length === 0 && (
          <li className="text-center text-[13px] text-text-tertiary py-8">No activity yet.</li>
        )}
      </ol>

      {onPostComment && (
        <div className="border-t border-border-subtle p-2 bg-bg-base sticky bottom-0">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
            }}
            placeholder="Add a comment…  (⌘↵ to send)"
            rows={2}
            className="w-full bg-bg-elevated border border-border-subtle rounded p-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-brand transition-colors duration-[120ms] resize-none"
            aria-label="Comment input"
          />
          <div className="mt-1 flex justify-end">
            <button
              onClick={submit}
              disabled={!draft.trim() || posting}
              className="h-7 px-3 rounded bg-accent-brand text-bg-base text-[12px] font-medium disabled:opacity-40 transition-opacity duration-[120ms]"
            >
              {posting ? 'Sending…' : 'Comment'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatRelative(iso: string) {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  if (Number.isNaN(diff)) return iso;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
