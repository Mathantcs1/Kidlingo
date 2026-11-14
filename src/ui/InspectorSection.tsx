// One collapsible group of the clip inspector (Premiere's "Effect Controls" groups): a triangle, a muted caps title,
// an optional summary on the right and the controls below. The open/closed choice is remembered per section name.
// A collapsed body stays mounted (hidden) so focus targets and controls keep existing; the header re-opens it.
import { useId, useState } from 'react';
import type { ReactNode } from 'react';

const KEY = 'clipforge.inspector.section.';

function stored(name: string): boolean | null {
  try {
    const v = localStorage.getItem(KEY + name);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

interface Props {
  /** Stable name: the storage key and the test id suffix. */
  name: string;
  title: string;
  /** Short value count / active state shown at the right of the header. */
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function InspectorSection({ name, title, summary, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState<boolean>(() => stored(name) ?? defaultOpen);
  const bodyId = useId();
  const toggle = (): void => {
    setOpen(!open);
    try {
      localStorage.setItem(KEY + name, open ? '0' : '1');
    } catch {
      /* private mode: the choice just is not remembered */
    }
  };
  return (
    <section className="isec" data-open={open} data-testid={`isec-${name}`}>
      <button type="button" className="isec-head" aria-expanded={open} aria-controls={bodyId} data-testid={`isec-toggle-${name}`} onClick={toggle}>
        <span className="isec-chevron" aria-hidden="true" />
        <span className="isec-title">{title}</span>
        {summary && <span className="isec-summary">{summary}</span>}
      </button>
      <div className="isec-body" id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
