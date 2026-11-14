// The in-app guide is plain data: topics made of a few block kinds, rendered by HelpPanel (no markdown library).
export type HelpBlock =
  | { t: 'p'; text: string }
  | { t: 'list'; items: string[] }
  | { t: 'steps'; items: string[] }
  /** Label / explanation pairs (a control and what it does). */
  | { t: 'rows'; rows: [string, string][] }
  /** The keyboard shortcut table, generated from helpShortcuts. */
  | { t: 'shortcuts' };

export interface HelpTopic {
  id: string;
  title: string;
  /** Heading of the group in the topic list. */
  group: string;
  /** Extra words the search also matches. */
  keywords?: string;
  blocks: HelpBlock[];
}
