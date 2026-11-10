import { reframeProject } from '../core/merge';
import type { FormatKey } from '../core/formats';
import { useEditor } from '../state/store';
import { FORMAT_LABELS, formatKeyOf } from './layout';
import { guard } from './Toast';

const KEYS = Object.keys(FORMAT_LABELS) as FormatKey[];

export default function FormatPicker() {
  const format = useEditor((s) => s.history.present.format);
  const apply = useEditor((s) => s.apply);
  const current = formatKeyOf(format);

  const onChange = (key: FormatKey): void => {
    if (key !== current) guard(() => apply((p) => reframeProject(p, key)));
  };

  return (
    <label className="format-picker">
      <span>Format</span>
      <select
        data-testid="format-select"
        value={current ?? ''}
        onChange={(e) => onChange(e.target.value as FormatKey)}
      >
        {current === null && (
          <option value="" disabled>
            Custom {format.width}×{format.height}
          </option>
        )}
        {KEYS.map((k) => (
          <option key={k} value={k}>
            {FORMAT_LABELS[k]}
          </option>
        ))}
      </select>
    </label>
  );
}
