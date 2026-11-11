import { describe, expect, it, vi } from 'vitest';
import { RecorderError, WORKLET_SOURCE, createRecorder } from '../src/media/recorder';
import type { RecorderDeps } from '../src/media/recorder';

class FakeTrack {
  stop = vi.fn();
  private listeners: (() => void)[] = [];
  addEventListener(_type: 'ended', fn: () => void): void {
    this.listeners.push(fn);
  }
  removeEventListener(_type: 'ended', fn: () => void): void {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }
  end(): void {
    for (const l of this.listeners) l();
  }
}

function fakeStream(n = 1) {
  const tracks = Array.from({ length: n }, () => new FakeTrack());
  return { tracks, stream: { getTracks: () => tracks, getAudioTracks: () => tracks } as unknown as MediaStream };
}

function harness(opts: { sampleRate?: number; worklet?: boolean; gum?: () => Promise<MediaStream> } = {}) {
  const { tracks, stream } = fakeStream(2);
  const node = { port: { onmessage: null as ((e: { data: Float32Array }) => void) | null }, disconnect: vi.fn() };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const ctx = {
    sampleRate: opts.sampleRate ?? 100,
    audioWorklet: opts.worklet === false ? undefined : { addModule: vi.fn(async (_url: string) => undefined) },
    createMediaStreamSource: vi.fn(() => source),
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  const getUserMedia = vi.fn(opts.gum ?? (async () => stream));
  const deps: RecorderDeps = {
    getUserMedia,
    createContext: () => ctx,
    createNode: () => node,
  };
  const push = (...values: number[]) => node.port.onmessage?.({ data: new Float32Array(values) });
  return { deps, ctx, node, source, tracks, getUserMedia, push };
}

const reject = (name: string) => async (): Promise<MediaStream> => {
  throw new DOMException('nope', name);
};

async function reasonOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(RecorderError);
    return (e as RecorderError).reason;
  }
  throw new Error('expected a rejection');
}

describe('createRecorder', () => {
  it('maps permission errors to denied and missing devices to no-device', async () => {
    for (const [name, reason] of [
      ['NotAllowedError', 'denied'],
      ['SecurityError', 'denied'],
      ['NotFoundError', 'no-device'],
      ['OverconstrainedError', 'no-device'],
    ]) {
      const h = harness({ gum: reject(name) });
      const r = createRecorder({ ...h.deps });
      expect(await reasonOf(r.start())).toBe(reason);
      expect(h.ctx.close).toHaveBeenCalled();
      expect(r.state()).toBe('idle');
    }
  });

  it('says no-device for a stream without audio tracks and releases it', async () => {
    const t = new FakeTrack();
    const empty = { getTracks: () => [t], getAudioTracks: () => [] } as unknown as MediaStream;
    const h = harness({ gum: async () => empty });
    const r = createRecorder(h.deps);
    expect(await reasonOf(r.start())).toBe('no-device');
    expect(t.stop).toHaveBeenCalled();
  });

  it('rejects unsupported without asking for the microphone when AudioWorklet is missing', async () => {
    const h = harness({ worklet: false });
    expect(await reasonOf(createRecorder(h.deps).start())).toBe('unsupported');
    expect(h.getUserMedia).not.toHaveBeenCalled();
    const noCtx = createRecorder({ ...h.deps, createContext: () => null });
    expect(await reasonOf(noCtx.start())).toBe('unsupported');
  });

  it('loads the worklet from a Blob URL and records the posted chunks', async () => {
    expect(WORKLET_SOURCE).toContain('registerProcessor');
    const h = harness();
    const r = createRecorder(h.deps);
    await r.start();
    expect(r.state()).toBe('recording');
    expect(h.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: expect.anything() }));
    expect(String(h.ctx.audioWorklet?.addModule.mock.calls[0][0])).toMatch(/^blob:/);
    expect(h.source.connect).toHaveBeenCalledWith(h.node);
    h.push(0.5, -0.5);
    h.push(1);
    expect(r.elapsed()).toBeCloseTo(0.03);
    const out = await r.stop();
    expect(out.sampleRate).toBe(100);
    expect(out.seconds).toBeCloseTo(0.03);
    expect(out.blob.size).toBe(44 + 6);
    for (const t of h.tracks) expect(t.stop).toHaveBeenCalledTimes(1);
    expect(h.ctx.close).toHaveBeenCalled();
    expect(r.state()).toBe('idle');
  });

  it('stops at maxSeconds, fires onLimit once and stop still returns the audio', async () => {
    const h = harness();
    const r = createRecorder({ ...h.deps, maxSeconds: 1 });
    const onLimit = vi.fn();
    r.onLimit = onLimit;
    await r.start();
    h.push(...new Array(60).fill(0.25));
    expect(onLimit).not.toHaveBeenCalled();
    h.push(...new Array(60).fill(0.25));
    h.push(...new Array(60).fill(0.25));
    expect(onLimit).toHaveBeenCalledTimes(1);
    expect(r.elapsed()).toBe(1);
    for (const t of h.tracks) expect(t.stop).toHaveBeenCalledTimes(1);
    const out = await r.stop();
    expect(out.seconds).toBe(1);
    expect(out.blob.size).toBe(44 + 200);
    expect(onLimit).toHaveBeenCalledTimes(1);
  });

  it('keeps the audio when the microphone goes away (track ended)', async () => {
    const h = harness();
    const r = createRecorder(h.deps);
    const onEnded = vi.fn();
    r.onEnded = onEnded;
    await r.start();
    h.push(0.1, 0.2);
    h.tracks[0].end();
    expect(onEnded).toHaveBeenCalledTimes(1);
    h.push(0.3);
    const out = await r.stop();
    expect(out.blob.size).toBe(44 + 4);
  });

  it('cancel releases every stream track and discards the audio', async () => {
    const h = harness();
    const r = createRecorder(h.deps);
    await r.start();
    h.push(0.1);
    r.cancel();
    for (const t of h.tracks) expect(t.stop).toHaveBeenCalledTimes(1);
    expect(h.node.disconnect).toHaveBeenCalled();
    expect(h.ctx.close).toHaveBeenCalled();
    expect(r.state()).toBe('idle');
    expect(r.elapsed()).toBe(0);
    await expect(r.stop()).rejects.toThrow();
  });

  it('cancel while the permission prompt is open releases the stream when it arrives', async () => {
    let resolve: (s: MediaStream) => void = () => undefined;
    const { tracks, stream } = fakeStream(1);
    const h = harness({ gum: () => new Promise((r) => (resolve = r)) });
    const r = createRecorder(h.deps);
    const started = r.start();
    r.cancel();
    resolve(stream);
    await expect(started).rejects.toMatchObject({ name: 'AbortError' });
    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(r.state()).toBe('idle');
  });

  it('refuses a second start while recording without touching the microphone again', async () => {
    const h = harness();
    const r = createRecorder(h.deps);
    await r.start();
    await expect(r.start()).rejects.toThrow(/already/i);
    expect(h.getUserMedia).toHaveBeenCalledTimes(1);
    for (const t of h.tracks) expect(t.stop).not.toHaveBeenCalled();
    expect(r.state()).toBe('recording');
    h.push(0.5);
    expect((await r.stop()).blob.size).toBe(46);
  });
});
