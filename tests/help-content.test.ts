import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HELP_TOPICS } from '../src/ui/helpContent';
import { filterTopics } from '../src/ui/helpSearch';
import { SHORTCUT_DOCS } from '../src/ui/helpShortcuts';
import { keyRouted, shortcutFor } from '../src/ui/keys';
import type { KeyLike, Shortcut } from '../src/ui/keys';

const src = (f: string): string => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const base: KeyLike = { key: '', code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, repeat: false };

describe('help content integrity', () => {
  it('has unique topic ids and non-empty topics', () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of HELP_TOPICS) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.blocks.length).toBeGreaterThan(0);
    }
  });

  it('has a controls topic for every inspector section', () => {
    const names = [...src('Inspector.tsx').matchAll(/<InspectorSection\s+name="([a-z]+)"/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThanOrEqual(5);
    const text = JSON.stringify(HELP_TOPICS.filter((t) => t.group === 'Effect Controls')).toLowerCase();
    for (const n of names) expect(text, `section ${n}`).toContain(n === 'effects' ? 'effects' : n);
    for (const id of ['controls-transform', 'controls-animation', 'controls-effects', 'controls-audio', 'controls-overlay']) {
      expect(HELP_TOPICS.some((t) => t.id === id), id).toBe(true);
    }
  });

  it('describes every toolbar and top bar button', () => {
    const toolbar = JSON.stringify(HELP_TOPICS.find((t) => t.id === 'toolbar')).toLowerCase();
    const labels: Record<string, string> = {
      'btn-new-project': 'new project', 'btn-undo': 'undo', 'btn-redo': 'redo', 'btn-play': 'play', 'btn-split': 'split',
      'btn-delete': 'delete', 'btn-ripple-delete': 'ripple delete', 'audio-detach': 'detach audio', 'btn-merge': 'merge',
      'btn-merge-all': 'merge all', 'copy-clip': 'copy', 'paste-clip': 'paste', 'duplicate-clip': 'duplicate',
      'record-button': 'record', 'overlay-add': 'add overlay', 'btn-export': 'export',
    };
    const ids = ['Toolbar.tsx', 'TopBar.tsx', 'RecordButton.tsx', 'OverlayMenu.tsx']
      .flatMap((f) => [...src(f).matchAll(/data-testid="((?:btn-|audio-detach|copy-clip|paste-clip|duplicate-clip|record-button|overlay-add)[a-z-]*)"/g)].map((m) => m[1]))
      .filter((id) => id !== 'btn-help' && id !== 'overlay-add-adjustment');
    expect(ids.length).toBeGreaterThanOrEqual(15);
    for (const id of new Set(ids)) {
      expect(labels[id], `no help label for ${id}`).toBeDefined();
      expect(toolbar, id).toContain(labels[id]);
    }
  });
});

describe('help shortcut table', () => {
  it('documents exactly the shortcuts of keys.ts and every row triggers its shortcut', () => {
    const ids = Object.keys(SHORTCUT_DOCS) as Shortcut[];
    const typeLine = readFileSync(new URL('../src/ui/keys.ts', import.meta.url), 'utf8').match(/export type Shortcut = ([^;]+);/)![1];
    const declared = [...typeLine.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
    expect(ids.slice().sort()).toEqual(declared);
    for (const id of ids) {
      const doc = SHORTCUT_DOCS[id];
      const found = shortcutFor({ ...base, ...doc.sample });
      expect(found, id).not.toBeNull();
      expect(doc.whenKeysSelected ? keyRouted(found!, true) : found, id).toBe(id);
    }
  });
});

describe('filterTopics', () => {
  it('returns every topic for a blank query and filters by words in any order', () => {
    expect(filterTopics(HELP_TOPICS, '  ')).toHaveLength(HELP_TOPICS.length);
    const r = filterTopics(HELP_TOPICS, 'keyboard shortcuts');
    expect(r.map((t) => t.id)).toContain('shortcuts');
    expect(r.length).toBeLessThan(HELP_TOPICS.length);
    expect(filterTopics(HELP_TOPICS, 'zzzqqq')).toEqual([]);
  });
});
