// Browser plumbing for the voice-over recorder: errors, the worklet module and the injectable entry points.

export type RecorderErrorReason = 'denied' | 'no-device' | 'busy' | 'unsupported';

const MESSAGES: Record<RecorderErrorReason, string> = {
  denied: "Microphone access was blocked. Allow it for this site in the browser's address bar, then try again.",
  'no-device': "No microphone was found. Connect one (or choose an input in your computer's sound settings), then try again.",
  busy: 'The microphone is in use by another app or could not be started. Close other apps using it, then try again.',
  unsupported: 'This browser cannot record from the microphone here.',
};

/** Why recording could not start; `message` is the plain-English text shown to the user. */
export class RecorderError extends Error {
  readonly reason: RecorderErrorReason;
  constructor(reason: RecorderErrorReason) {
    super(MESSAGES[reason]);
    this.name = 'RecorderError';
    this.reason = reason;
  }
}

export const PROCESSOR = 'clipforge-recorder';

/** The worklet module (loaded from a Blob URL): averages the input channels and posts each render quantum. */
export const WORKLET_SOURCE = `class ClipforgeRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const chans = inputs[0];
    if (chans && chans.length > 0 && chans[0].length > 0) {
      const out = new Float32Array(chans[0].length);
      for (const c of chans) for (let i = 0; i < out.length; i++) out[i] += c[i] / chans.length;
      this.port.postMessage(out, [out.buffer]);
    }
    return true;
  }
}
registerProcessor('${PROCESSOR}', ClipforgeRecorder);
`;

export interface NodeLike {
  port: { onmessage: ((e: { data: Float32Array }) => void) | null };
  disconnect(): void;
}
export interface ContextLike {
  sampleRate: number;
  audioWorklet?: { addModule(url: string): Promise<void> };
  createMediaStreamSource(s: MediaStream): { connect(n: NodeLike): unknown; disconnect(): void };
  resume(): Promise<void>;
  close(): Promise<void>;
}

/** Browser entry points, injectable for tests. */
export interface RecorderDeps {
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  createContext?: () => ContextLike | null;
  createNode?: (ctx: ContextLike, name: string) => NodeLike;
}

export const CONSTRAINTS: MediaStreamConstraints = { audio: { channelCount: { ideal: 1 } }, video: false };

export function browserDeps(): Required<RecorderDeps> {
  return {
    getUserMedia: (c) => {
      const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
      if (!md?.getUserMedia) return Promise.reject(new RecorderError('unsupported'));
      return md.getUserMedia(c);
    },
    createContext: () => (typeof AudioContext === 'undefined' ? null : (new AudioContext() as unknown as ContextLike)),
    createNode: (ctx, name) =>
      new AudioWorkletNode(ctx as unknown as BaseAudioContext, name, { numberOfInputs: 1, numberOfOutputs: 0 }) as unknown as NodeLike,
  };
}

export function mapError(e: unknown): unknown {
  const name = e instanceof Error || e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return new RecorderError('denied');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new RecorderError('no-device');
  // Chromium reports a microphone held by another app (or one that failed to open) as NotReadableError/AbortError.
  if (name === 'NotReadableError' || name === 'AbortError') return new RecorderError('busy');
  return e;
}

export const aborted = (): DOMException => new DOMException('Recording was cancelled', 'AbortError');
