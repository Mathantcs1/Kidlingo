/**
 * Minimal ElevenLabs text-to-speech client. SECURITY: the API key goes ONLY into the `xi-api-key` request header of
 * requests to ELEVENLABS_ORIGIN. It is never logged, never put in a URL/body, and never in an error message; response
 * bodies are never copied into messages (only `detail.status` is read, for quota detection).
 */
export const ELEVENLABS_ORIGIN = 'https://api.elevenlabs.io';
export const MAX_TEXT_CODE_POINTS = 5000;

export type ElevenLabsReason =
  | 'no-key'
  | 'invalid-key'
  | 'quota'
  | 'rate-limit'
  | 'too-long'
  | 'network'
  | 'aborted'
  | 'server'
  | 'empty';

const MESSAGES: Record<ElevenLabsReason, string> = {
  'no-key': 'Add your ElevenLabs API key in Settings first.',
  'invalid-key': 'ElevenLabs did not accept your API key. Check it in Settings.',
  quota: 'Your ElevenLabs plan has run out of characters or reached its limit.',
  'rate-limit': 'ElevenLabs is rate limiting requests. Wait a moment and try again.',
  'too-long': `The script must be between 1 and ${MAX_TEXT_CODE_POINTS} characters.`,
  network: 'Could not reach ElevenLabs from the browser. Check your connection or any ad blocker.',
  aborted: 'Cancelled.',
  server: 'ElevenLabs returned an error. Try again in a moment.',
  empty: 'ElevenLabs returned no audio. Try again.',
};

export class ElevenLabsError extends Error {
  readonly reason: ElevenLabsReason;
  constructor(reason: ElevenLabsReason) {
    super(MESSAGES[reason]);
    this.name = 'ElevenLabsError';
    this.reason = reason;
  }
}

export type TtsModel = 'eleven_multilingual_v2' | 'eleven_flash_v2_5';
export interface Voice { id: string; name: string }
export interface Subscription { used: number; limit: number }
export interface ElevenLabs {
  listVoices(signal?: AbortSignal): Promise<Voice[]>;
  subscription(signal?: AbortSignal): Promise<Subscription | null>;
  synthesize(req: { text: string; voiceId: string; model: TtsModel }, signal?: AbortSignal): Promise<Blob>;
}

/** Reads only `detail.status` from a JSON error body; nothing else from the body is ever surfaced. */
async function isQuotaBody(res: Response): Promise<boolean> {
  try {
    const b = JSON.parse(await res.text()) as { detail?: { status?: unknown } };
    return b?.detail?.status === 'quota_exceeded';
  } catch {
    return false;
  }
}

async function failFor(res: Response, signal?: AbortSignal): Promise<ElevenLabsError> {
  if (res.status === 401) {
    const quota = await isQuotaBody(res);
    if (signal?.aborted) return new ElevenLabsError('aborted');
    return new ElevenLabsError(quota ? 'quota' : 'invalid-key');
  }
  if (res.status === 402) return new ElevenLabsError('quota');
  if (res.status === 429) return new ElevenLabsError('rate-limit');
  return new ElevenLabsError('server');
}

/** Empty or dot-only ids survive encodeURIComponent and would be normalised out of the URL path. */
const DOT_ONLY = /^\.*$/;

export function createElevenLabs(opts: {
  getKey(): Promise<string | null>;
  fetch?: typeof fetch;
}): ElevenLabs {
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);

  /** One guarded request: key check, fetch, error mapping. Errors never carry the cause or key. */
  async function request<T>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: string; accept: string },
    signal: AbortSignal | undefined,
    read: (res: Response) => Promise<T>,
  ): Promise<T> {
    let key: string | null = null;
    try {
      key = await opts.getKey();
    } catch {
      key = null; // a failing key store reads as no key; its message is never surfaced
    }
    if (!key) throw new ElevenLabsError('no-key');
    if (signal?.aborted) throw new ElevenLabsError('aborted');
    try {
      const headers: Record<string, string> = { 'xi-api-key': key, accept: init.accept };
      if (init.body !== undefined) headers['content-type'] = 'application/json';
      const res = await doFetch(`${ELEVENLABS_ORIGIN}${path}`, { method: init.method, headers, body: init.body, signal });
      if (!res.ok) throw await failFor(res, signal);
      return await read(res);
    } catch (e) {
      if (e instanceof ElevenLabsError) throw e;
      if (signal?.aborted || (e instanceof Error && e.name === 'AbortError')) throw new ElevenLabsError('aborted');
      throw new ElevenLabsError('network');
    }
  }

  return {
    listVoices(signal) {
      return request('/v1/voices', { method: 'GET', accept: 'application/json' }, signal, async (res) => {
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          throw new ElevenLabsError(signal?.aborted ? 'aborted' : 'server');
        }
        const list = (body as { voices?: unknown } | null)?.voices;
        if (!Array.isArray(list)) throw new ElevenLabsError('server');
        const out: Voice[] = [];
        for (const v of list) {
          const o = v as { voice_id?: unknown; name?: unknown } | null;
          if (o && typeof o.voice_id === 'string' && !DOT_ONLY.test(o.voice_id) && typeof o.name === 'string') out.push({ id: o.voice_id, name: o.name });
        }
        return out;
      });
    },

    async subscription(signal) {
      try {
        return await request('/v1/user/subscription', { method: 'GET', accept: 'application/json' }, signal, async (res) => {
          const b = (await res.json()) as { character_count?: unknown; character_limit?: unknown };
          if (typeof b.character_count !== 'number' || typeof b.character_limit !== 'number') return null;
          return { used: b.character_count, limit: b.character_limit };
        });
      } catch {
        return null;
      }
    },

    async synthesize({ text, voiceId, model }, signal) {
      if (text.trim().length === 0 || [...text].length > MAX_TEXT_CODE_POINTS) throw new ElevenLabsError('too-long');
      let encoded: string;
      try {
        encoded = encodeURIComponent(voiceId); // throws URIError on a lone surrogate
      } catch {
        throw new ElevenLabsError('server');
      }
      if (DOT_ONLY.test(voiceId)) throw new ElevenLabsError('server');
      return request(
        `/v1/text-to-speech/${encoded}?output_format=mp3_44100_128`,
        { method: 'POST', body: JSON.stringify({ text, model_id: model }), accept: 'audio/mpeg' },
        signal,
        async (res) => {
          const type = res.headers.get('content-type') ?? '';
          const buf = await res.arrayBuffer();
          const audioish = type === '' || type.startsWith('audio/') || type === 'application/octet-stream';
          if (buf.byteLength === 0 || !audioish) throw new ElevenLabsError('empty');
          return new Blob([buf], { type: 'audio/mpeg' });
        },
      );
    },
  };
}
