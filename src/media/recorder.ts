// Microphone capture for voice-overs (decision D8): getUserMedia → AudioContext → an inline AudioWorklet that posts
// mono Float32 chunks to the main thread, kept in memory (capped) and written out as a WAV. No MediaRecorder.
import { CONSTRAINTS, PROCESSOR, RecorderError, WORKLET_SOURCE, aborted, browserDeps, mapError } from './recorderParts';
import type { ContextLike, NodeLike, RecorderDeps } from './recorderParts';
import { encodeWav } from './wav';

export { RecorderError, WORKLET_SOURCE } from './recorderParts';
export type { RecorderDeps, RecorderErrorReason } from './recorderParts';

export interface Recording {
  blob: Blob;
  seconds: number;
  sampleRate: number;
}

/** 'stopped': capture ended by itself (limit reached or microphone gone); `stop()` still returns the audio. */
export type RecorderState = 'idle' | 'starting' | 'recording' | 'stopped';

export interface Recorder {
  /** Asks for the microphone and starts capturing. Call inside the user gesture (the AudioContext starts there). */
  start(): Promise<void>;
  /** Ends capture and returns the audio as a WAV. */
  stop(): Promise<Recording>;
  /** Discards everything and releases the microphone. */
  cancel(): void;
  /** Seconds of audio captured so far. */
  elapsed(): number;
  state(): RecorderState;
  /** Called once when `maxSeconds` is reached (capture stops; the audio is kept). */
  onLimit: (() => void) | null;
  /** Called once when the microphone goes away mid-recording (capture stops; the audio is kept). */
  onEnded: (() => void) | null;
}

export function createRecorder(opts: RecorderDeps & { maxSeconds?: number } = {}): Recorder {
  const deps = { ...browserDeps(), ...opts };
  const maxSeconds = opts.maxSeconds ?? 1800;
  let state: RecorderState = 'idle';
  let session = 0;
  let live: { ctx: ContextLike; stream?: MediaStream; node?: NodeLike; source?: { disconnect(): void } } | null = null;
  let rate = 0;
  let blocks: Float32Array[] = [];
  let fill = 0;
  let count = 0;

  const onTrackEnded = (): void => {
    if (state !== 'recording') return;
    halt();
    rec.onEnded?.();
  };

  function release(): void {
    if (!live) return;
    const { ctx, stream, node, source } = live;
    live = null;
    source?.disconnect();
    if (node) {
      node.port.onmessage = null;
      node.disconnect();
    }
    for (const t of stream?.getAudioTracks() ?? []) t.removeEventListener('ended', onTrackEnded);
    for (const t of stream?.getTracks() ?? []) t.stop();
    void ctx.close().catch(() => undefined);
  }

  function reset(): void {
    blocks = [];
    fill = 0;
    count = 0;
  }

  function halt(): void {
    release();
    state = 'stopped';
  }

  /** Appends samples into one-second blocks (few objects even for a 30-minute take). */
  function take(data: Float32Array): void {
    if (state !== 'recording') return;
    const piece = data.subarray(0, Math.max(0, Math.round(maxSeconds * rate) - count));
    for (let i = 0; i < piece.length; ) {
      if (blocks.length === 0 || fill === blocks[blocks.length - 1].length) {
        blocks.push(new Float32Array(rate));
        fill = 0;
      }
      const n = Math.min(piece.length - i, rate - fill);
      blocks[blocks.length - 1].set(piece.subarray(i, i + n), fill);
      fill += n;
      i += n;
    }
    count += piece.length;
    if (count >= Math.round(maxSeconds * rate)) {
      halt();
      rec.onLimit?.();
    }
  }

  async function start(): Promise<void> {
    if (state !== 'idle') throw new Error('Already recording');
    const token = ++session;
    reset();
    const ctx = deps.createContext();
    if (!ctx?.audioWorklet) {
      void ctx?.close().catch(() => undefined);
      throw new RecorderError('unsupported');
    }
    state = 'starting';
    live = { ctx };
    rate = ctx.sampleRate;
    void ctx.resume().catch(() => undefined);
    const fail = (e: unknown): never => {
      if (token === session) {
        release();
        state = 'idle';
      }
      throw e;
    };
    let stream: MediaStream;
    try {
      stream = await deps.getUserMedia(CONSTRAINTS);
    } catch (e) {
      return fail(token === session ? mapError(e) : aborted());
    }
    if (token !== session) {
      for (const t of stream.getTracks()) t.stop();
      throw aborted();
    }
    live.stream = stream;
    if (stream.getAudioTracks().length === 0) return fail(new RecorderError('no-device'));
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } catch {
      return fail(token === session ? new RecorderError('unsupported') : aborted());
    } finally {
      URL.revokeObjectURL(url);
    }
    if (token !== session) throw aborted();
    const node = deps.createNode(ctx, PROCESSOR);
    node.port.onmessage = (e) => take(e.data);
    const source = ctx.createMediaStreamSource(stream);
    source.connect(node);
    Object.assign(live, { node, source });
    for (const t of stream.getAudioTracks()) t.addEventListener('ended', onTrackEnded);
    state = 'recording';
  }

  async function stop(): Promise<Recording> {
    if (state !== 'recording' && state !== 'stopped') throw new Error('Not recording');
    release();
    const chunks = blocks.map((b, i) => (i === blocks.length - 1 ? b.subarray(0, fill) : b));
    const out = { blob: encodeWav(chunks, rate), seconds: count / rate, sampleRate: rate };
    reset();
    state = 'idle';
    return out;
  }

  function cancel(): void {
    if (state === 'idle') return;
    session++;
    release();
    reset();
    state = 'idle';
  }

  const rec: Recorder = {
    start,
    stop,
    cancel,
    elapsed: () => (rate > 0 ? count / rate : 0),
    state: () => state,
    onLimit: null,
    onEnded: null,
  };
  return rec;
}
