import { useEffect, useRef, useState } from 'react';
import type { Id, VisualEffect } from '../core/model';
import { hasLut } from '../media/luts';
import { useEditor } from '../state/store';
import { importLutFile, updateClipFx } from './fxCommands';

interface Props {
  clipId: Id;
  fx: VisualEffect;
  disabled: boolean;
}

/** Choose the LUT of a LUT effect from the project's library, or import a `.cube` file (one undo step). */
export default function LutPicker({ clipId, fx, disabled }: Props) {
  const luts = useEditor((s) => s.history.present.luts);
  const inputRef = useRef<HTMLInputElement>(null);
  const [present, setPresent] = useState(true);
  const ref = fx.ref;
  useEffect(() => {
    let alive = true;
    if (ref) hasLut(ref).then((ok) => alive && setPresent(ok), () => alive && setPresent(false));
    return () => {
      alive = false;
    };
  }, [ref]);
  const missing = ref !== undefined && (!luts[ref] || luts[ref].missing === true || !present);
  return (
    <div className="effect-param fx-lut">
      <span>LUT</span>
      <select value={ref ?? ''} disabled={disabled} data-testid="lut-select" aria-label="LUT" onChange={(e) => e.target.value && updateClipFx(clipId, fx.id, { ref: e.target.value })}>
        <option value="">Choose a LUT…</option>
        {Object.values(luts).map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({l.size}³)
          </option>
        ))}
      </select>
      <button type="button" className="effect-btn fx-import" disabled={disabled} onClick={() => inputRef.current?.click()}>
        Import .cube…
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".cube"
        className="fx-file"
        data-testid="lut-import"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importLutFile(file, { clipId, fxId: fx.id });
        }}
      />
      {missing && (
        <span className="fx-lut-missing" role="status" data-testid="lut-missing">
          LUT missing
        </span>
      )}
    </div>
  );
}
