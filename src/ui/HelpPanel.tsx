// The Help panel: a right-hand slide-over dialog with a searchable topic list on the left and the topic on the right.
// Modal like the Save-as-preset dialog (App makes the editor inert and turns global shortcuts off while it is open);
// Esc closes, Tab stays inside, and focus goes back to where it was.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHelp, closeHelp } from './helpStore';
import HelpBlocks from './HelpBlocks';
import { HELP_TOPICS } from './helpContent';
import { filterTopics } from './helpSearch';
import { currentModality, focusAs } from './inputModality';
import './help.css';

export default function HelpPanel() {
  const initial = useHelp((s) => s.topic);
  const [query, setQuery] = useState('');
  const [topicId, setTopicId] = useState<string>(initial ?? HELP_TOPICS[0].id);
  const root = useRef<HTMLDivElement>(null);
  const [{ opener, modality }] = useState(() => ({ opener: document.activeElement, modality: currentModality() }));
  const shown = useMemo(() => filterTopics(HELP_TOPICS, query), [query]);
  const topic = shown.find((t) => t.id === topicId) ?? shown[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeHelp();
      } else if (e.key === 'Tab' && root.current) {
        const items = [...root.current.querySelectorAll<HTMLElement>('input, button, a[href]')].filter((x) => !x.matches(':disabled'));
        if (items.length === 0) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i < 0 || i === items.length - 1 ? 0 : i + 1;
        e.preventDefault();
        items[next].focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    root.current?.querySelector<HTMLElement>('[data-testid="help-search"]')?.focus();
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (opener instanceof HTMLElement && opener.isConnected && !opener.matches(':disabled')) focusAs(opener, modality);
    };
  }, [opener, modality]);

  const groups = [...new Set(shown.map((t) => t.group))];
  return (
    <div className="help-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeHelp()}>
      <div className="help-panel" role="dialog" aria-modal="true" aria-labelledby="help-title" data-testid="help-panel" ref={root}>
        <div className="help-head">
          <h2 id="help-title">Help</h2>
          <button type="button" data-testid="help-close" aria-label="Close help" onClick={closeHelp}>
            ✕
          </button>
        </div>
        <div className="help-body">
          <nav className="help-nav" aria-label="Help topics">
            <input
              type="search"
              data-testid="help-search"
              aria-label="Search help"
              placeholder="Search help"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {shown.length === 0 && <p className="help-empty">No topic matches.</p>}
            {groups.map((g) => (
              <div key={g} className="help-group">
                <h3>{g}</h3>
                {shown.filter((t) => t.group === g).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="help-topic"
                    data-testid={`help-topic-${t.id}`}
                    aria-current={t.id === topic?.id}
                    onClick={() => setTopicId(t.id)}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <article className="help-content" data-testid="help-content" data-topic={topic?.id} tabIndex={-1}>
            {topic && (
              <>
                <h3>{topic.title}</h3>
                <HelpBlocks blocks={topic.blocks} />
              </>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
