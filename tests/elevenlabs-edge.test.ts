import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElevenLabs, ElevenLabsError } from '../src/ai/elevenlabs';

const KEY = 'sk_test_KEYLEAKCANARY_123456';
const req = { text: 'Hello', voiceId: 'v1', model: 'eleven_multilingual_v2' as const };
afterEach(() => vi.restoreAllMocks());

async function caught(p: Promise<unknown>): Promise<ElevenLabsError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ElevenLabsError);
    expect(String(e)).not.toContain(KEY);
    return e as ElevenLabsError;
  }
  throw new Error('expected rejection');
}
const make = (fetchFn: (url: string, init: RequestInit) => unknown, getKey: () => Promise<string | null> = async () => KEY) => {
  const f = vi.fn(async (u: RequestInfo | URL, i?: RequestInit) => fetchFn(String(u), i ?? {}) as Response);
  return { api: createElevenLabs({ getKey, fetch: f as unknown as typeof fetch }), f };
};

describe('abort during a body read', () => {
  it('listVoices reports aborted, not server', async () => {
    const ac = new AbortController();
    const { api } = make(() => ({ ok: true, status: 200, json: async () => { ac.abort(); throw new SyntaxError('x'); } }));
    expect((await caught(api.listVoices(ac.signal))).reason).toBe('aborted');
  });
  it('a 401 body read reports aborted, not invalid-key', async () => {
    const ac = new AbortController();
    const { api } = make(() => ({ ok: false, status: 401, text: async () => { ac.abort(); throw new DOMException('a', 'AbortError'); } }));
    expect((await caught(api.synthesize(req, ac.signal))).reason).toBe('aborted');
  });
  it('a synthesize body read abort is aborted', async () => {
    const ac = new AbortController();
    const { api } = make(() => ({ ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => { ac.abort(); throw new DOMException('a', 'AbortError'); } }));
    expect((await caught(api.synthesize(req, ac.signal))).reason).toBe('aborted');
  });
});

describe('getKey and voice id edge cases', () => {
  it('a throwing getKey is no-key without its message, and no fetch', async () => {
    const { api, f } = make(() => new Response(), async () => { throw new Error('idb exploded ' + KEY); });
    const e = await caught(api.synthesize(req));
    expect(e.reason).toBe('no-key');
    expect(e.message).not.toContain('idb exploded');
    expect((await caught(api.listVoices())).reason).toBe('no-key');
    expect(await api.subscription()).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it.each(['\ud800', 'a\udc00b'])('a lone-surrogate voice id %j maps to server before any fetch', async (voiceId) => {
    const { api, f } = make(() => new Response());
    expect((await caught(api.synthesize({ ...req, voiceId }))).reason).toBe('server');
    expect(f).not.toHaveBeenCalled();
  });
  it('listVoices skips dot-only voice ids', async () => {
    const { api } = make(() => new Response(JSON.stringify({ voices: [{ voice_id: '..', name: 'x' }, { voice_id: '.', name: 'y' }, { voice_id: 'ok', name: 'Ok' }] })));
    expect(await api.listVoices()).toEqual([{ id: 'ok', name: 'Ok' }]);
  });
});
