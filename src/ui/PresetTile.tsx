// One tile of the preset browser (Plan 5B D10, Q12): a small Canvas2D preview painted from presetPreview (the SAME
// resolver as the clip), the preset's name and a favourite star. Only the tile the browser marks `animate` (hovered,
// else focused) runs its preview loop (requestAnimationFrame, 30 fps grid); every other tile, and every tile under
// prefers-reduced-motion, shows its still frame. No decode, no WebGL.
import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { MotionSlot, PresetKey } from '../core/motionTypes';
import { presetLabel } from '../core/presets';
import { TILE, previewFrame, stillTime, tileTime } from './presetPreview';

const CARD_FILL = '#5b8def';
const CARD_EDGE = '#ffd166';

function paint(canvas: HTMLCanvasElement, key: PresetKey, slot: MotionSlot, t: number): void {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(TILE.width * dpr);
  const h = Math.round(TILE.height * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, TILE.width, TILE.height);
  const { corners, opacity } = previewFrame(key, slot, t);
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.closePath();
  ctx.fillStyle = CARD_FILL;
  ctx.fill();
  // The top edge is marked so turns (a half turn included) read on the card.
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  ctx.lineTo(corners[1].x, corners[1].y);
  ctx.strokeStyle = CARD_EDGE;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

interface Props {
  presetKey: PresetKey;
  slot: MotionSlot;
  /** The roving tab stop of the grid (tabIndex 0); the others are −1. */
  tabbable: boolean;
  animate: boolean;
  /** Why the tile cannot be applied to this clip (aria-disabled + title), or null. */
  disabledReason: string | null;
  favourite: boolean;
  current: boolean;
  setRef(el: HTMLDivElement | null): void;
  onApply(): void;
  onToggleFavourite(): void;
  onHover(on: boolean): void;
  onFocus(on: boolean): void;
  onKeyDown(e: KeyboardEvent<HTMLDivElement>): void;
}

export default function PresetTile(props: Props) {
  const { presetKey: key, slot, animate } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const label = presetLabel(key, slot);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const still = (): void => paint(el, key, slot, stillTime(key, slot));
    if (!animate || reducedMotion()) {
      still();
      return;
    }
    let raf = 0;
    let shown = -1;
    const start = performance.now();
    const frame = (now: number): void => {
      const t = tileTime(key, slot, now - start);
      if (t !== shown) {
        shown = t;
        paint(el, key, slot, t);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      still();
    };
  }, [animate, key, slot]);
  const disabled = props.disabledReason !== null;
  return (
    <div className="preset-tile-wrap" onPointerEnter={() => props.onHover(true)} onPointerLeave={() => props.onHover(false)}>
      <div
        ref={props.setRef}
        role="option"
        className={`preset-tile${props.current ? ' is-current' : ''}`}
        data-testid={`preset-tile-${key}`}
        data-slot={slot}
        data-animating={animate ? 'true' : undefined}
        tabIndex={props.tabbable ? 0 : -1}
        aria-selected={props.current}
        aria-disabled={disabled || undefined}
        aria-label={disabled ? `${label} (${props.disabledReason})` : label}
        title={props.disabledReason ?? label}
        onClick={() => !disabled && props.onApply()}
        onFocus={() => props.onFocus(true)}
        onBlur={() => props.onFocus(false)}
        onKeyDown={props.onKeyDown}
      >
        <canvas ref={canvas} className="preset-preview" data-testid={`preset-preview-${key}`} aria-hidden="true" style={{ width: TILE.width, height: TILE.height }} />
        <span className="preset-name">{label}</span>
      </div>
      <button
        type="button"
        className="preset-fav"
        data-testid={`preset-fav-${key}`}
        tabIndex={-1}
        aria-pressed={props.favourite}
        aria-label={props.favourite ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
        title={props.favourite ? 'Remove from favourites (F)' : 'Add to favourites (F)'}
        onClick={props.onToggleFavourite}
      >
        {props.favourite ? '★' : '☆'}
      </button>
    </div>
  );
}
