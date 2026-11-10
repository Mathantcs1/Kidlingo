// OS files dropped where nothing handles them would make the browser open the file and leave the editor.
import { useEffect } from 'react';

const hasFiles = (e: DragEvent): boolean => e.dataTransfer?.types.includes('Files') ?? false;

/**
 * Window-level, after the page's own handlers: a file drag that no handler accepted (the media bin calls
 * preventDefault on the drags it imports) is cancelled, so dropping it does nothing (dragover shows "no drop").
 */
function cancelStrayFileDrop(e: DragEvent): void {
  if (!hasFiles(e) || e.defaultPrevented) return;
  e.preventDefault();
  if (e.type === 'dragover' && e.dataTransfer) e.dataTransfer.dropEffect = 'none';
}

/** Installs the guard once for the app's lifetime. */
export function useFileDropGuard(): void {
  useEffect(() => {
    window.addEventListener('dragover', cancelStrayFileDrop);
    window.addEventListener('drop', cancelStrayFileDrop);
    return () => {
      window.removeEventListener('dragover', cancelStrayFileDrop);
      window.removeEventListener('drop', cancelStrayFileDrop);
    };
  }, []);
}
