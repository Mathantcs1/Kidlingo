import type { HelpBlock, HelpTopic } from './helpTypes';

const blockText = (b: HelpBlock): string => {
  if (b.t === 'p') return b.text;
  if (b.t === 'list' || b.t === 'steps') return b.items.join(' ');
  if (b.t === 'rows') return b.rows.map(([a, c]) => `${a} ${c}`).join(' ');
  return 'keyboard shortcuts keys';
};

/** Topics whose title, keywords or text contain every word of `query` (case-insensitive); all of them for a blank query. */
export function filterTopics(topics: readonly HelpTopic[], query: string): HelpTopic[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...topics];
  return topics.filter((t) => {
    const hay = `${t.title} ${t.group} ${t.keywords ?? ''} ${t.blocks.map(blockText).join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
