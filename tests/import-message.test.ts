import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_MESSAGE, importMessage } from '../src/ui/importMessage';
import { ImportError } from '../src/media/importErrors';

const file = (name: string) => new File(['x'], name);

describe('importMessage', () => {
  it('shows ImportError messages as they are, and words other failures with the file name', () => {
    expect(importMessage(file('a.cube'), new ImportError('Could not import a.cube: bad.'))).toBe('Could not import a.cube: bad.');
    expect(importMessage(file('a.mp4'), new Error('boom'))).toBe('Could not import a.mp4: boom');
    expect(importMessage(file('a.mp4'), Object.assign(new Error('x'), { name: 'QuotaExceededError' }))).toMatch(/^Could not import a\.mp4: Your browser's storage is full/);
  });

  it('caps any message at 300 characters', () => {
    expect(MAX_IMPORT_MESSAGE).toBe(300);
    const long = importMessage(file('a.mp4'), new ImportError('y'.repeat(5_000_000)));
    expect(long.length).toBe(300);
    expect(long.endsWith('…')).toBe(true);
    expect(importMessage(file(`${'n'.repeat(400)}.mp4`), new Error('boom')).length).toBe(300);
  });
});
