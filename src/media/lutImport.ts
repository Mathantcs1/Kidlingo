// Importing a `.cube` file: validate, store in OPFS, return the library entry (the caller adds it with addLut).
import { newId } from '../core/model';
import type { LutRef } from '../core/model';
import { parseCube } from '../fx/cube';
import { putLutText } from './luts';

export const MAX_LUT_BYTES = 20 * 1024 * 1024;

/** Throws an Error with a plain-English message when the file cannot be used. */
export async function importLut(file: File): Promise<LutRef> {
  if (file.size > MAX_LUT_BYTES) throw new Error('This LUT file is larger than 20 MB, which is too big for a .cube LUT');
  const text = await file.text();
  const parsed = parseCube(text);
  if (!parsed.ok) throw new Error(parsed.reason);
  const id = newId();
  await putLutText(id, text);
  const fallback = file.name.replace(/\.[^.]*$/, '').trim() || 'LUT';
  return { id, name: parsed.title || fallback, size: parsed.size };
}
