import { describe, it, expect } from 'vitest';
import { buildClipChain } from '../src/audio/chain';
import type { Segment } from '../src/audio/plan';
import { defaultClipAudio } from '../src/core/model';
import type { Clip } from '../src/core/model';

/** A recording stand-in for the few BaseAudioContext calls the chain makes. */
class FakeParam {
  value = 0;
  calls: [string, number, number][] = [];
  setValueAtTime(v: number, t: number) {
    this.calls.push(['set', v, t]);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(['ramp', v, t]);
    return this;
  }
}
class FakeNode {
  out: FakeNode[] = [];
  disconnected = false;
  channelCount = 1;
  channelCountMode = 'max';
  channelInterpretation = 'speakers';
  constructor(readonly kind: string, readonly gain = new FakeParam(), readonly pan = new FakeParam()) {}
  connect(n: FakeNode) {
    this.out.push(n);
    return n;
  }
  disconnect() {
    this.disconnected = true;
  }
}
function fakeCtx() {
  const nodes: FakeNode[] = [];
  const make = (kind: string) => {
    const n = new FakeNode(kind);
    nodes.push(n);
    return n;
  };
  return { nodes, ctx: { createGain: () => make('gain'), createStereoPanner: () => make('pan') } };
}

function clip(over: Partial<Clip> = {}): Clip {
  return {
    id: 'c',
    mediaId: 'm',
    kind: 'audio',
    start: 2,
    in: 0,
    out: 4,
    volume: 0.5,
    audio: { ...defaultClipAudio(), fadeIn: 1, fadeOut: 1, pan: -0.25 },
    fit: 'fit',
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    ...over,
  };
}
const seg = (c: Clip, when: number, srcFrom: number, srcTo: number): Segment => ({
  clipId: c.id,
  mediaId: c.mediaId,
  srcFrom,
  srcTo,
  when,
  clip: c,
  trackVolume: 0.8,
});

function path(from: FakeNode): string[] {
  const out = [from.kind];
  for (let n = from; n.out.length === 1; n = n.out[0]) out.push(n.out[0].kind);
  return out;
}

describe('buildClipChain', () => {
  it('wires input → clip gain → panner → track gain → duck gain = output', () => {
    const { ctx, nodes } = fakeCtx();
    const c = clip();
    const chain = buildClipChain({ ctx: ctx as never, clip: c, trackVolume: 0.8, seg: seg(c, 2, 0, 4), ctxStart: 10 });
    expect(path(chain.input as never)).toEqual(['gain', 'gain', 'pan', 'gain', 'gain']);
    const [, clipGain, pan, track, duck] = [chain.input as never as FakeNode, ...nodes.slice(1)];
    expect(chain.output).toBe(duck);
    expect(pan.pan.value).toBe(-0.25);
    expect(pan.channelCount).toBe(2);
    expect(pan.channelCountMode).toBe('explicit');
    expect(track.gain.value).toBe(0.8);
    // Fade × clip volume, scheduled at ctxStart + timeline time.
    expect(clipGain.gain.calls).toEqual([
      ['set', 0, 12],
      ['ramp', 0.5, 13],
      ['ramp', 0.5, 15],
      ['ramp', 0, 16],
    ]);
    chain.dispose();
    expect(nodes.every((n) => n.disconnected)).toBe(true);
  });

  it('a later window starts at the cut gain and duck points are scheduled within the window', () => {
    const { ctx, nodes } = fakeCtx();
    const c = clip();
    const duckPoints = [
      { t: 0, gain: 1 },
      { t: 4, gain: 0.5 },
    ];
    buildClipChain({ ctx: ctx as never, clip: c, trackVolume: 1, seg: seg(c, 2.5, 0.5, 1.5), ctxStart: 1, duckPoints });
    expect(nodes[1].gain.calls).toEqual([
      ['set', 0.25, 3.5],
      ['ramp', 0.5, 4],
      ['ramp', 0.5, 4.5],
    ]);
    expect(nodes[4].gain.calls).toEqual([
      ['set', 0.6875, 3.5],
      ['ramp', 0.5625, 4.5],
    ]);
  });

  it('without duck points the duck gain stays at unity with no automation', () => {
    const { ctx, nodes } = fakeCtx();
    const c = clip();
    buildClipChain({ ctx: ctx as never, clip: c, trackVolume: 1, seg: seg(c, 2, 0, 4), ctxStart: 0 });
    expect(nodes[4].gain.value).toBe(1);
    expect(nodes[4].gain.calls).toEqual([]);
  });
});
