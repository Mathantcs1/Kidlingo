import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElevenLabs, ElevenLabsError, ELEVENLABS_ORIGIN } from '../src/ai/elevenlabs';

const KEY = 'sk_test_KEYLEAKCANARY_123456';
type Call = { url: string; init: RequestInit };

function audio(bytes = 16): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
}
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>, key: string | null = KEY) {
  const calls: Call[] = [];
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler(String(url), init ?? {});
  });
  const api = createElevenLabs({ getKey: async () => key, fetch: fetchFn as unknown as typeof fetch });
  return { api, calls, fetchFn };
}
const req = { text: 'Hello there', voiceId: 'voice1', model: 'eleven_multilingual_v2' as const };

const consoleSpies = () =>
  (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

async function caught(p: Promise<unknown>): Promise<ElevenLabsError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ElevenLabsError);
    return e as ElevenLabsError;
  }
  throw new Error('expected rejection');
}
function expectNoLeak(e: ElevenLabsError) {
  expect(e.message).not.toContain(KEY);
  expect(String(e)).not.toContain(KEY);
  expect(JSON.stringify(e)).not.toContain(KEY);
  expect(String((e as { cause?: unknown }).cause ?? '')).not.toContain(KEY);
  expect(e.stack ?? '').not.toContain(KEY);
}

describe('synthesize request', () => {
  it('POSTs to the ElevenLabs origin with the key only in xi-api-key', async () => {
    const { api, calls } = setup(() => audio());
    const blob = await api.synthesize(req);
    expect(blob.size).toBe(16);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe(`${ELEVENLABS_ORIGIN}/v1/text-to-speech/voice1?output_format=mp3_44100_128`);
    expect(init.method).toBe('POST');
    const h = new Headers(init.headers);
    expect(h.get('xi-api-key')).toBe(KEY);
    expect(h.get('content-type')).toBe('application/json');
    expect(h.get('accept')).toBe('audio/mpeg');
    for (const [k, v] of h.entries()) if (k !== 'xi-api-key') expect(v).not.toContain(KEY);
    expect(url).not.toContain(KEY);
    expect(String(init.body)).not.toContain(KEY);
    expect(JSON.parse(String(init.body))).toEqual({ text: 'Hello there', model_id: 'eleven_multilingual_v2' });
  });

  it.each(['../../evil', 'a?b=1', 'a#frag', 'a/b', 'https://evil.com/x', 'a b', '%2e%2e'])(
    'keeps a hostile voice id %j under the origin path',
    async (voiceId) => {
      const { api, calls } = setup(() => audio());
      await api.synthesize({ ...req, voiceId });
      const u = new URL(calls[0]!.url);
      expect(calls[0]!.url.startsWith(`${ELEVENLABS_ORIGIN}/v1/text-to-speech/`)).toBe(true);
      expect(u.origin).toBe(ELEVENLABS_ORIGIN);
      expect(u.pathname.startsWith('/v1/text-to-speech/')).toBe(true);
      expect(u.pathname.slice('/v1/text-to-speech/'.length)).not.toContain('/');
      expect([...u.searchParams.keys()]).toEqual(['output_format']);
      expect(u.hash).toBe('');
    },
  );

  it.each(['', '.', '..'])('refuses the dot-only/empty voice id %j before any fetch', async (voiceId) => {
    const { api, fetchFn } = setup(() => audio());
    await caught(api.synthesize({ ...req, voiceId }));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('never calls another origin across all endpoints', async () => {
    const { api, calls } = setup((url) =>
      url.includes('/voices') ? json(200, { voices: [] }) : url.includes('subscription') ? json(200, {}) : audio(),
    );
    await api.listVoices();
    await api.subscription();
    await api.synthesize(req);
    for (const c of calls) expect(c.url.startsWith(`${ELEVENLABS_ORIGIN}/`)).toBe(true);
  });

  it('refuses blank text, over-long text and no key before any fetch', async () => {
    const { api, fetchFn } = setup(() => audio());
    for (const text of ['', '   \n\t']) expect((await caught(api.synthesize({ ...req, text }))).reason).toBe('too-long');
    expect((await caught(api.synthesize({ ...req, text: 'a'.repeat(5001) }))).reason).toBe('too-long');
    expect((await caught(api.synthesize({ ...req, text: '😀'.repeat(5001) }))).reason).toBe('too-long');
    expect(fetchFn).not.toHaveBeenCalled();
    const nk = setup(() => audio(), null);
    expect((await caught(nk.api.synthesize(req))).reason).toBe('no-key');
    expect(nk.fetchFn).not.toHaveBeenCalled();
  });

  it('counts emoji as one code point (5000 emoji is accepted, 5000 chars exactly is accepted)', async () => {
    const { api, fetchFn } = setup(() => audio());
    await api.synthesize({ ...req, text: '😀'.repeat(5000) });
    await api.synthesize({ ...req, text: 'a'.repeat(5000) });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('error mapping', () => {
  const cases: [string, () => Response, string][] = [
    ['401', () => json(401, { detail: { status: 'invalid_api_key', message: 'bad ' + KEY } }), 'invalid-key'],
    ['401 quota', () => json(401, { detail: { status: 'quota_exceeded', message: KEY } }), 'quota'],
    ['402', () => json(402, { detail: KEY }), 'quota'],
    ['429', () => json(429, { detail: KEY }), 'rate-limit'],
    ['500', () => new Response(KEY, { status: 500 }), 'server'],
    ['503', () => new Response(KEY, { status: 503 }), 'server'],
    ['422', () => json(422, { detail: [{ msg: KEY }] }), 'server'],
    ['empty body', () => new Response(new Uint8Array(0), { status: 200 }), 'empty'],
    ['non-audio body', () => new Response('<html>' + KEY + '</html>', { status: 200, headers: { 'content-type': 'text/html' } }), 'empty'],
  ];
  it.each(cases)('%s maps to the right reason and never leaks', async (_n, resp, reason) => {
    const spies = consoleSpies();
    const { api } = setup(resp);
    const e = await caught(api.synthesize(req));
    expect(e.reason).toBe(reason);
    expect(e.message.length).toBeGreaterThan(10);
    expectNoLeak(e);
    expect(e.message).not.toContain('<html>');
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(KEY);
  });

  it('thrown TypeError is a network error with the plain message and no leak', async () => {
    const spies = consoleSpies();
    const { api } = setup(() => {
      throw new TypeError('Failed to fetch ' + KEY);
    });
    const e = await caught(api.synthesize(req));
    expect(e.reason).toBe('network');
    expect(e.message).toBe('Could not reach ElevenLabs from the browser. Check your connection or any ad blocker.');
    expectNoLeak(e);
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(KEY);
  });

  it('abort mid-flight is aborted, not network', async () => {
    const ac = new AbortController();
    const { api } = setup(
      (_u, init) =>
        new Promise<Response>((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(new DOMException('aborted ' + KEY, 'AbortError')));
        }),
    );
    const p = caught(api.synthesize(req, ac.signal));
    ac.abort();
    const e = await p;
    expect(e.reason).toBe('aborted');
    expectNoLeak(e);
  });

  it('an already-aborted signal is aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const { api } = setup(() => {
      throw new TypeError('x');
    });
    expect((await caught(api.synthesize(req, ac.signal))).reason).toBe('aborted');
  });
});

describe('listVoices', () => {
  it('maps voices and ignores malformed entries', async () => {
    const { api, calls } = setup(() =>
      json(200, { voices: [{ voice_id: 'a', name: 'Alice' }, { voice_id: 5 }, null, { name: 'x' }, { voice_id: 'b', name: 'Bob' }] }),
    );
    expect(await api.listVoices()).toEqual([
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ]);
    expect(calls[0]!.url).toBe(`${ELEVENLABS_ORIGIN}/v1/voices`);
    expect(calls[0]!.init.method ?? 'GET').toBe('GET');
    expect(new Headers(calls[0]!.init.headers).get('xi-api-key')).toBe(KEY);
  });
  it('401 is invalid-key, no key is no-key, bad JSON is server', async () => {
    expect((await caught(setup(() => json(401, {})).api.listVoices())).reason).toBe('invalid-key');
    const nk = setup(() => json(200, {}), null);
    expect((await caught(nk.api.listVoices())).reason).toBe('no-key');
    expect(nk.fetchFn).not.toHaveBeenCalled();
    expect((await caught(setup(() => new Response('nope', { status: 200 })).api.listVoices())).reason).toBe('server');
  });
});

describe('subscription', () => {
  it('returns used/limit', async () => {
    const { api, calls } = setup(() => json(200, { character_count: 120, character_limit: 10000 }));
    expect(await api.subscription()).toEqual({ used: 120, limit: 10000 });
    expect(calls[0]!.url).toBe(`${ELEVENLABS_ORIGIN}/v1/user/subscription`);
  });
  it('is null on any failure', async () => {
    expect(await setup(() => json(401, {})).api.subscription()).toBeNull();
    expect(await setup(() => json(200, { character_count: 'x' })).api.subscription()).toBeNull();
    expect(await setup(() => new Response('x', { status: 200 })).api.subscription()).toBeNull();
    expect(await setup(() => { throw new TypeError('x'); }).api.subscription()).toBeNull();
    expect(await setup(() => json(200, {}), null).api.subscription()).toBeNull();
  });
});
