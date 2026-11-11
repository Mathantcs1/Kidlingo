import { describe, it, expect } from 'vitest';
import { balanceGains, buildClipChain } from '../src/audio/chain';
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
  /** [target, output, input] */
  out: [FakeNode, number, number][] = [];
  disconnected = false;
  channelCount = 1;
  channelCountMode = 'max';
  channelInterpretation = 'speakers';
  readonly gain = new FakeParam();
  constructor(readonly kind: string) {}
  connect(n: FakeNode, output = 0, input = 0) {
    this.out.push([n, output, input]);
    return n;
  }
  disconnect() {
    this.disconnected = true;
  }
}
function fakeCtx() {
  const nodes: FakeNode[] = [];
  const make = (kind: string) => () => {
    const n = new FakeNode(kind);
    nodes.push(n);
    return n;
  };
  const ctx = { sampleRate: 48000, createGain: make('gain'), createChannelSplitter: make('split'), createChannelMerger: make('merge') };
  return { nodes, ctx };
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
const seg = (c: Clip, when: number, srcFrom: number, srcTo: number, over: Partial<Segment> = {}): Segment => ({
  clipId: c.id,
  mediaId: c.mediaId,
  srcFrom,
  srcTo,
  when,
  whenEnd: when + (srcTo - srcFrom),
  clip: c,
  trackVolume: 0.8,
  ...over,
});

const one = (n: FakeNode): FakeNode => {
  expect(n.out).toHaveLength(1);
  return n.out[0][0];
};

describe('balanceGains', () => {
  it('is unity at the centre, never above 1, and silences the far side at full pan', () => {
    expect(balanceGains(0)).toEqual([1, 1]);
    expect(balanceGains(-1)[0]).toBe(1);
    expect(balanceGains(-1)[1]).toBeCloseTo(0, 12);
    expect(balanceGains(1)[0]).toBeCloseTo(0, 12);
    expect(balanceGains(1)[1]).toBe(1);
    expect(balanceGains(0.5)[0]).toBeCloseTo(Math.SQRT1_2, 12);
    for (let p = -1; p <= 1; p += 0.05) for (const g of balanceGains(p)) expect(g).toBeLessThanOrEqual(1);
    expect(balanceGains(Number.NaN)).toEqual([1, 1]);
    expect(balanceGains(-7)).toEqual(balanceGains(-1));
  });
});

describe('buildClipChain', () => {
  it('wires input → clip gain → splitter → L/R balance gains → merger → track gain → duck gain = output', () => {
    const { ctx, nodes } = fakeCtx();
    const c = clip();
    const chain = buildClipChain({ ctx: ctx as never, clip: c, trackVolume: 0.8, seg: seg(c, 2, 0, 4), ctxStart: 10 });
    const input = chain.input as never as FakeNode;
    const clipGain = one(input);
    const split = one(clipGain);
    expect(split.kind).toBe('split');
    // Mono is up-mixed to L = R before the split, so the centre is unity for mono and stereo.
    expect([clipGain.channelCount, clipGain.channelCountMode, clipGain.channelInterpretation]).toEqual([
      2,
      'explicit',
      'speakers',
    ]);
    expect(split.out.map(([, o]) => o)).toEqual([0, 1]);
    const [gl, gr] = split.out.map(([n]) => n);
    expect(gl.gain.value).toBe(1);
    expect(gr.gain.value).toBeCloseTo(Math.cos((0.25 * Math.PI) / 2), 12);
    const merge = one(gl);
    expect(merge.kind).toBe('merge');
    expect(gl.out[0][2]).toBe(0);
    expect(gr.out).toEqual([[merge, 0, 1]]);
    const track = one(merge);
    expect(track.gain.value).toBe(0.8);
    const duck = one(track);
    expect(chain.output).toBe(duck);
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

  it('ends the fade at the planned end (whenEnd), so a cut lands on the same time on both sides', () => {
    const { ctx, nodes } = fakeCtx();
    const c = clip();
    buildClipChain({ ctx: ctx as never, clip: c, trackVolume: 1, seg: seg(c, 2, 0, 1, { whenEnd: 2.75 }), ctxStart: 0 });
    expect(nodes[1].gain.calls[nodes[1].gain.calls.length - 1]).toEqual(['ramp', 0.375, 2.75]);
  });

  it('a later window starts at the cut gain; duck points come from the segment', () => {
    const { ctx, nodes } = fakeCtx();
    const c = clip();
    const duckPoints = [
      { t: 0, gain: 1 },
      { t: 4, gain: 0.5 },
    ];
    const s = seg(c, 2.5, 0.5, 1.5, { duckPoints });
    const chain = buildClipChain({ ctx: ctx as never, clip: c, trackVolume: 1, seg: s, ctxStart: 1 });
    expect(nodes[1].gain.calls).toEqual([
      ['set', 0.25, 3.5],
      ['ramp', 0.5, 4],
      ['ramp', 0.5, 4.5],
    ]);
    const duck = chain.output as never as FakeNode;
    expect(duck.gain.calls).toEqual([
      ['set', 0.6875, 3.5],
      ['ramp', 0.5625, 4.5],
    ]);
  });

  it('without duck points the duck gain stays at unity with no automation', () => {
    const { ctx } = fakeCtx();
    const c = clip();
    const chain = buildClipChain({ ctx: ctx as never, clip: c, trackVolume: 1, seg: seg(c, 2, 0, 4), ctxStart: 0 });
    const duck = chain.output as never as FakeNode;
    expect(duck.gain.value).toBe(1);
    expect(duck.gain.calls).toEqual([]);
  });

  it('the seam gate opens and closes on whole frames, whatever the float error of ctxStart + from', () => {
    const { ctx, nodes } = fakeCtx();
    const c = clip({ audio: { ...defaultClipAudio(), effects: [{ id: 'g', type: 'gain', enabled: true, params: { gainDb: 0 } }] } });
    // Window 3 of a 1 s render with a 0.2 s pre-roll: (0.2 - 3) + 3 is 0.20000000000000018, a hair past frame 9600,
    // which a ceil would push to frame 9601 (the gate one frame late in this window and not in the one-pass render).
    const ctxStart = 9600 / 48000 - 3;
    buildClipChain({ ctx: ctx as never, clip: c, trackVolume: 1, seg: seg(c, 3, 1, 2, { whenEnd: 4 }), ctxStart });
    const gate = nodes.find((n) => n.gain.calls.length === 2 && n.gain.calls[0][1] === 1 && n.gain.calls[1][1] === 0)!;
    const frames = gate.gain.calls.map(([, , t]) => t * 48000);
    expect(frames.map(Math.ceil)).toEqual([9600, 57600]);
    expect(frames.map(Math.round)).toEqual([9600, 57600]);
  });
});
