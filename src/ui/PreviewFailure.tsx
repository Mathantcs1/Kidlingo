import { useRef, useState } from 'react';

export interface GlFailureView {
  headline: string;
  hint: string;
  details: string;
}

/** Copies `text`; if the clipboard is unavailable, opens the details and selects the text for a manual copy. */
async function copyText(text: string, pre: HTMLPreElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!pre) return false;
    (pre.closest('details') as HTMLDetailsElement | null)?.setAttribute('open', '');
    const range = document.createRange();
    range.selectNodeContents(pre);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return false;
  }
}

/** The preview panel when the WebGL2 renderer could not start: why, what to check, Try again and Copy details. */
export function PreviewFailure({ view, onRetry }: { view: GlFailureView; onRetry(): void }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState<'copied' | 'selected' | null>(null);
  const copy = (): void => {
    void copyText(view.details, preRef.current).then((ok) => setCopied(ok ? 'copied' : 'selected'));
  };
  return (
    <div className="preview-message preview-failure" role="status" data-testid="preview-unavailable">
      <p className="preview-failure-headline">{view.headline}</p>
      <p>{view.hint}</p>
      <div className="preview-failure-actions">
        <button type="button" data-testid="preview-retry" onClick={onRetry}>
          Try again
        </button>
        <button type="button" data-testid="preview-copy-details" onClick={copy}>
          Copy details
        </button>
        {copied && (
          <span data-testid="preview-copy-status">
            {copied === 'copied' ? 'Copied' : 'Select and copy the details below'}
          </span>
        )}
      </div>
      <details data-testid="preview-details">
        <summary>Technical details</summary>
        <pre ref={preRef}>{view.details}</pre>
      </details>
    </div>
  );
}
