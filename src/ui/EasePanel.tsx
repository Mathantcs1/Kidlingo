import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { EASE_KINDS, SPRING_DEFAULT, isSameEase } from '../core/easing';
import type { Ease, EaseKind } from '../core/easing';
import { targetKeys } from '../core/keyframeEdits';
import type { KeyRef } from '../core/keyframeEdits';
import { tooClose } from '../core/keyframes';
import type { Clip, Project } from '../core/model';
import { useEditor } from '../state/store';
import EaseCurve from './EaseCurve';
import { bezierOf, clampHandle, parseField, round3, segmentSeconds } from './easeEditorMath';
import type { Bezier } from './easeEditorMath';
import { closeEase } from './easeEditorStore';
import type { EaseOpen } from './easeEditorStore';
import { setEaseCmd } from './keyframeCommands';
import SpringFields from './SpringFields';
import { useEasePanelChrome } from './useEasePanelChrome';
import './ease.css';

const LABELS: Record<EaseKind, string> = {
  linear: 'Linear', hold: 'Hold', easeIn: 'Ease in', easeOut: 'Ease out', easeInOut: 'Ease in-out', back: 'Back', elastic: 'Elastic', bounce: 'Bounce', bezier: 'Custom', spring: 'Spring',
};
const FIELDS = ['x1', 'y1', 'x2', 'y2'] as const;
const CSS_EASE: Bezier = [0.25, 0.1, 0.25, 1];

function locate(p: Project, id: string): { clip: Clip; locked: boolean } | null {
  for (const t of p.tracks) for (const clip of t.clips) if (clip.id === id) return { clip, locked: t.locked };
  return null;
}

/** The ease of each opened key (undefined when its key is gone). */
const easesOf = (clip: Clip, refs: readonly KeyRef[]): (Ease | undefined)[] =>
  refs.map((r) => (targetKeys(clip, r.target) ?? []).find((k) => tooClose(k.t, r.t))?.ease);

export default function EasePanel({ open }: { open: EaseOpen }) {
  const present = useEditor((s) => s.history.present);
  const found = locate(present, open.clipId);
  const eases = found ? easesOf(found.clip, open.refs) : [];
  const gone = eases.length === 0 || eases.some((e) => e === undefined);
  const committed: Ease = (eases[0] as Ease | undefined) ?? { kind: 'linear' };
  const mixed = !eases.every((e) => e && isSameEase(e, committed));
  const locked = found?.locked ?? true;
  const [draft, setDraftState] = useState<Ease | null>(null);
  const [texts, setTexts] = useState<(string | null)[]>([null, null, null, null]);
  const draftRef = useRef<Ease | null>(null);
  const cancelled = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const setDraft = (e: Ease | null): void => {
    draftRef.current = e;
    setDraftState(e);
  };
  const lastCount = found ? open.refs.filter((r) => { const l = targetKeys(found.clip, r.target) ?? []; return l.length > 0 && tooClose(l[l.length - 1].t, r.t); }).length : 0;
  const shown = draft ?? committed;
  const handles = bezierOf(shown);
  // The segment each key owns, in physical seconds (a spring's shape depends on it, D5); the curve shows the first.
  // (A last key owns no segment and does not count; none at all reads as 1 s.)
  const secs = found ? open.refs.flatMap((r) => segmentSeconds(targetKeys(found.clip, r.target), r.t) ?? []) : [];
  const seconds = secs[0] ?? 1;
  const mixedSeconds = secs.some((x) => Math.abs(x - seconds) > 1e-9);

  useEffect(() => {
    if (gone) closeEase();
  }, [gone]);
  useEasePanelChrome(panel, open, cancelled);

  // Keys pressed inside the panel (preset buttons, handles) must not reach the global shortcuts (delete, space, nudge);
  // number inputs already own theirs.
  const keepShortcuts = (e: ReactKeyboardEvent<HTMLElement>): void => {
    if (e.target instanceof HTMLInputElement) return;
    if (['Delete', 'Backspace', ' ', '[', ']'].includes(e.key)) e.stopPropagation();
  };
  const commit = (e: Ease): void => {
    if (!cancelled.current && !locked) setEaseCmd(open.clipId, open.refs, e);
  };
  // A drag or nudge that ended where it began (or on a preset's own curve) must not turn a preset into a custom curve.
  const release = (): void => {
    const d = draftRef.current;
    setDraft(null);
    if (!d?.bezier) return;
    const base = bezierOf(committed);
    if (!mixed && base && committed.kind !== 'bezier' && base.every((v, i) => v === d.bezier![i])) return;
    commit(d);
  };
  const choose = (kind: EaseKind): void => {
    setDraft(null);
    if (kind === 'spring') commit({ kind, spring: { ...(shown.kind === 'spring' && shown.spring ? shown.spring : SPRING_DEFAULT) } });
    else commit(kind === 'bezier' ? { kind, bezier: bezierOf(shown) ?? [...CSS_EASE] } : { kind });
  };
  const commitField = (i: number): void => {
    const text = texts[i];
    if (text === null) return;
    setTexts((t) => t.map((x, j) => (j === i ? null : x)));
    const n = parseField(text);
    if (n === null || !handles) return;
    const h = clampHandle(i % 2 === 0 ? { x: n, y: 0 } : { x: 0, y: n });
    const next = [...handles] as Bezier;
    next[i] = round3(i % 2 === 0 ? h.x : h.y);
    // Typing the number a key already has changes nothing (a preset stays a preset); a mixed selection still unifies.
    if (next.every((v, j) => round3(v) === round3(handles[j])) && !mixed) return;
    commit({ kind: 'bezier', bezier: next });
  };
  return (
    <div ref={panel} className="ease-editor" data-testid="ease-editor" role="dialog" aria-modal="false" aria-label="Ease editor" onKeyDown={keepShortcuts}>
      <div className="ease-head">
        <span>{open.refs.length > 1 ? `Ease of ${open.refs.length} keyframes` : 'Ease of keyframe'}</span>
        <button type="button" className="ease-close" data-testid="ease-close" aria-label="Close ease editor" onClick={closeEase}>
          ×
        </button>
      </div>
      <p className="ease-note">The curve shapes the segment from this key to the next.{mixed && ' The keys differ; showing the first.'}{shown.kind === 'spring' && mixedSeconds && ' The segments differ in length; the curve shows the first.'}{locked && ' Track is locked.'}
        {lastCount > 0 && (lastCount === open.refs.length ? ' Last key: its ease only applies if a key is added after it.' : ' Some keys are last in their list: their ease only applies if a key is added after them.')}
      </p>
      <div className="ease-presets" role="group" aria-label="Ease presets">
        {EASE_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className="ease-preset"
            data-testid={`ease-preset-${kind}`}
            aria-pressed={!mixed && shown.kind === kind}
            disabled={locked}
            onClick={() => choose(kind)}
          >
            {LABELS[kind]}
          </button>
        ))}
      </div>
      <EaseCurve ease={shown} seconds={seconds} bezier={handles} disabled={locked} onDraft={(b: Bezier) => setDraft({ kind: 'bezier', bezier: b })} onRelease={release} onCancel={() => setDraft(null)} />
      {shown.kind === 'spring' && <SpringFields spring={shown.spring ?? SPRING_DEFAULT} seconds={seconds} disabled={locked} onCommit={(spring) => commit({ kind: 'spring', spring })} />}
      {shown.kind !== 'spring' && <div className="ease-fields">
        {FIELDS.map((name, i) => (
          <label key={name} className="ease-field">
            <span>{name}</span>
            <input
              type="number"
              inputMode="decimal"
              step={0.01}
              min={i % 2 === 0 ? 0 : -1}
              max={i % 2 === 0 ? 1 : 2}
              data-testid={`ease-${name}`}
              aria-label={`Curve ${name}`}
              disabled={locked || !handles}
              value={texts[i] ?? (handles ? String(round3(handles[i])) : '')}
              onChange={(e) => setTexts((t) => t.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                commitField(i);
              }}
              onBlur={() => commitField(i)}
            />
          </label>
        ))}
      </div>}
    </div>
  );
}
