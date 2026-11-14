// The loop of one animated property (Plan 5B Task 8, D4): None / Repeat / Ping-pong / Continue (offset) after the last
// key, and a cycle count ("∞" when empty = until the clip end). ONE step per change. Hidden below two keys (a loop
// needs a period); a loop stored on a one-key target (inert) shows again as it was when a second key arrives.
import { useState } from 'react';
import type { AnimTarget } from '../core/keyframeEdits';
import { targetKeys } from '../core/keyframeEdits';
import { localTime } from '../core/keyframes';
import type { LoopMode } from '../core/keyTypes';
import type { Clip, KeyLoop } from '../core/model';
import { targetLoop } from '../core/targetLoops';
import { parseField } from './easeEditorMath';
import { onClip, setLoopCmd } from './keyframeCommands';
import './motionEdit.css';

const MODES: [LoopMode | 'none', string][] = [['none', 'No loop'], ['repeat', 'Repeat'], ['pingPong', 'Ping-pong'], ['offset', 'Continue']];

interface Props {
  clip: Clip;
  target: AnimTarget;
  group: readonly AnimTarget[];
  label: string;
  ids: { loop: string; count: string };
  disabled: boolean;
  title?: string;
  playhead: number;
  fps: number;
}

export default function KeyLoopControl({ clip, target, group, label, ids, disabled, title, playhead, fps }: Props) {
  const [text, setText] = useState<string | null>(null);
  const list = targetKeys(clip, target) ?? [];
  if (list.length < 2) return null;
  const loop = targetLoop(clip, target);
  const set = (next: KeyLoop | null): void => setLoopCmd(clip.id, group, next);
  const commitCount = (): void => {
    if (text === null || !loop) return;
    setText(null);
    const n = text.trim() === '' || text.trim() === '∞' ? null : parseField(text);
    if (n === null && text.trim() !== '' && text.trim() !== '∞') return; // not a number: keep the stored count
    if (n !== loop.count) set({ mode: loop.mode, count: n });
  };
  // Editing past the last key of a looped target adds a key there and lengthens the loop (R3-8): say so.
  const past = loop && onClip(clip, playhead) && localTime(clip, playhead, fps) > list[list.length - 1].t + 1e-9;
  return (
    <div className="kf-loop" data-testid={`${ids.loop}-row`}>
      <select
        className="kf-loop-mode"
        data-testid={ids.loop}
        aria-label={`Loop ${label} after its last keyframe`}
        title={title ?? `Loop ${label} after its last keyframe`}
        value={loop?.mode ?? 'none'}
        disabled={disabled}
        onChange={(e) => set(e.target.value === 'none' ? null : { mode: e.target.value as LoopMode, count: loop?.count ?? null })}
      >
        {MODES.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
      </select>
      <label className="kf-loop-count">
        <span>×</span>
        <input
          type="text"
          inputMode="numeric"
          data-testid={ids.count}
          aria-label={`${label} loop cycles after the first (empty: until the clip ends)`}
          placeholder="∞"
          disabled={disabled || !loop}
          value={text ?? (loop?.count != null ? String(loop.count) : '')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            commitCount();
          }}
          onBlur={commitCount}
        />
      </label>
      {past && <span className="kf-loop-hint" data-testid={`${ids.loop}-hint`}>Past the last key: an edit here adds a key and lengthens the loop.</span>}
    </div>
  );
}
