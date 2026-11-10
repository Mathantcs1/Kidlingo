import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/core/model';
import type { MediaRef, Project } from '../src/core/model';
import { createHistory, commit } from '../src/state/history';
import { referencedMedia, unusedMedia } from '../src/media/gc';
import { describeStorageError, QUOTA_MESSAGE } from '../src/media/storageErrors';

const media = (id: string): MediaRef => ({ id, name: `${id}.mp4`, kind: 'video', duration: 1, hasAudio: false });
const withMedia = (...ids: string[]): Project => ({ ...emptyProject(), media: Object.fromEntries(ids.map((id) => [id, media(id)])) });

describe('referencedMedia', () => {
  it('collects media ids from the present and every undo/redo state', () => {
    let h = createHistory(withMedia('a'));
    h = commit(h, withMedia('a', 'b'));
    h = commit(h, withMedia('c'));
    h = { ...h, future: [withMedia('d')] };
    expect([...referencedMedia(h)].sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('unusedMedia', () => {
  it('lists stored files that are neither referenced nor still being imported', () => {
    expect(unusedMedia(['a', 'b', 'c', 'd'], new Set(['a']), new Set(['d']))).toEqual(['b', 'c']);
    expect(unusedMedia([], new Set(['a']), new Set())).toEqual([]);
    expect(unusedMedia(['a'], new Set(['a']), new Set())).toEqual([]);
  });
});

describe('describeStorageError', () => {
  it('maps quota errors (DOMException or by name) to the storage-full message', () => {
    expect(describeStorageError(new DOMException('x', 'QuotaExceededError'))).toBe(QUOTA_MESSAGE);
    expect(describeStorageError(Object.assign(new Error('x'), { name: 'QuotaExceededError' }))).toBe(QUOTA_MESSAGE);
    expect(QUOTA_MESSAGE).toBe("Your browser's storage is full. Remove media you no longer need, then reload the page (or start a New project) to free the space.");
  });

  it('passes other errors through as their message', () => {
    expect(describeStorageError(new Error('disk on fire'))).toBe('disk on fire');
    expect(describeStorageError('weird')).toBe('weird');
  });
});
