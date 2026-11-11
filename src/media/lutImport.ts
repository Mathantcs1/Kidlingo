// Import of a .cube LUT file as media of kind 'lut' (Plan 4 D5): validated, then the ORIGINAL file is stored in OPFS.
import { newId } from '../core/model';
import type { MediaRef } from '../core/model';
import { CubeError, assertCubeBytes, parseCube } from './cube';
import { ImportError } from './importErrors';
import { putMedia } from './storage';

/**
 * Checks `file` is a 3D .cube LUT ClipForge can use (size first, so a huge file is never read), then stores it under
 * a new media id. Its name is the LUT's TITLE, else the file name. Nothing is stored when it is refused: the
 * ImportError names the file and says why in plain English. A failed write leaves no file behind (putMedia).
 */
export async function importLut(file: File): Promise<MediaRef> {
  let title: string | undefined;
  try {
    assertCubeBytes(file.size);
    ({ title } = parseCube(await file.text()));
  } catch (e) {
    if (e instanceof CubeError) throw new ImportError(`Could not import ${file.name}: ${e.message}`);
    throw new ImportError(`Could not read ${file.name}.`);
  }
  const id = newId();
  await putMedia(id, file);
  return { id, name: title ?? file.name, kind: 'lut', duration: 0, hasAudio: false, fileName: file.name };
}
