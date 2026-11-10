import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useEditor } from '../state/store';
import { FORMAT_LABELS, aspectLabel, fitBox, formatKeyOf } from './layout';

/** Tracks the content-box size of an element. */
function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/**
 * The preview panel slot: a box at the project's aspect ratio, fitted to the panel. The real preview canvas
 * replaces the placeholder content in the next step.
 */
export default function PreviewSlot() {
  const format = useEditor((s) => s.history.present.format);
  const [ref, size] = useElementSize<HTMLDivElement>();
  const box = fitBox(size, format);
  const key = formatKeyOf(format);

  return (
    <section className="preview" aria-label="Preview">
      <div className="preview-stage" ref={ref}>
        <div
          className="preview-placeholder"
          data-testid="preview-placeholder"
          style={{ width: box.width, height: box.height }}
        >
          <span className="preview-format">{key ? FORMAT_LABELS[key] : 'Custom'}</span>
          <span className="preview-dims">
            {format.width}×{format.height} · {aspectLabel(format.width, format.height)}
          </span>
        </div>
      </div>
    </section>
  );
}
