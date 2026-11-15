import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsError } from '../src/ai/elevenlabs';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, MediaRef, Project } from '../src/core/model';
import { addTrack } from '../src/core/tracks';
import { useEditor } from '../src/state/store';
import { generateVoiceOver } from '../src/ui/aiVoiceCommands';
import type { VoiceDeps } from '../src/ui/aiVoiceCommands';
import { useToasts } from '../src/ui/Toast';

const KEY = 'sk_unit_KEYCANARY_123456';
const REQ = { text: 'Hello there', voiceId: 'v1', model: 'eleven_multilingual_v2' as const };

const s = () => useEditor.getState();
const present = (): Project => s().history.present;
const toasts = (): string[] => useToasts.getState().toasts.map((x) => x.message);
const audioTracks = () => present().tracks.filter((t) => t.kind === 'audio');

interface Log { calls: string[]; removed: string[]; imported: string[]; consent: boolean; asked: number; answer: boolean }
let log: Log;
let synth: (req: unknown, signal: AbortSignal) => Promise<Blob>;

function deps(): VoiceDeps {
  return {
    synthesize: (req, signal) => {
      log.calls.push('synthesize');
      return synth(req, signal);
    },
    importFile: async (f: File): Promise<MediaRef> => {
      log.imported.push(f.name);
      return { id: `m${log.imported.length}`, name: f.name, kind: 'audio', duration: 1, hasAudio: true };
    },
    removeMedia: async (id: string) => void log.removed.push(id),
    askConfirm: async () => {
      log.asked++;
      return log.answer;
    },
    getConsent: async () => log.consent,
    setConsent: async (v: boolean) => void (log.consent = v),
  };
}

const run = (req = REQ, signal = new AbortController().signal) => generateVoiceOver(req, signal, deps());

const lockedClip = (): Clip => ({
  id: 'c', mediaId: 'x', kind: 'audio', start: 0, in: 0, out: 100, transform: defaultTransform(), volume: 1,
  audio: defaultClipAudio(), effects: [], blend: 'normal', fit: 'fit',
});

beforeEach(() => {
  s().loadProject(emptyProject());
  useToasts.setState({ toasts: [] });
  log = { calls: [], removed: [], imported: [], consent: false, asked: 0, answer: true };
  synth = async () => new Blob(['mp3'], { type: 'audio/mpeg' });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('generateVoiceOver', () => {
  it('asks for consent once, before any request, and remembers it', async () => {
    synth = async () => {
      expect(log.asked).toBe(1);
      return new Blob(['mp3']);
    };
    expect(await run()).toBe(true);
    expect(await run()).toBe(true);
    expect(log.asked).toBe(1);
    expect(log.consent).toBe(true);
  });

  it('declining consent sends nothing and changes nothing', async () => {
    log.answer = false;
    expect(await run()).toBe(false);
    expect(log.calls).toEqual([]);
    expect(log.consent).toBe(false);
    expect(s().history.past).toHaveLength(0);
  });

  it('names media AI voice 1 then 2, places at the playhead captured at press time, in ONE apply', async () => {
    s().setPlayhead(4);
    let resolve!: () => void;
    const gate = new Promise<void>((r) => (resolve = r));
    synth = async () => {
      await gate;
      return new Blob(['mp3']);
    };
    const pending = run();
    await vi.waitFor(() => expect(log.calls).toEqual(['synthesize']));
    s().setPlayhead(9); // the user moves the playhead meanwhile
    resolve();
    expect(await pending).toBe(true);
    expect(s().history.past).toHaveLength(1);
    expect(log.imported).toEqual(['AI voice 1.mp3']);
    const [m] = Object.values(present().media);
    expect(m.name).toBe('AI voice 1');
    expect(audioTracks()[0].clips[0]).toMatchObject({ mediaId: m.id, start: 4, in: 0, out: 1 });
    synth = async () => new Blob(['mp3']);
    await run();
    expect(Object.values(present().media).map((x) => x.name).sort()).toEqual(['AI voice 1', 'AI voice 2']);
    s().undo();
    expect(Object.keys(present().media)).toHaveLength(1);
  });

  it('a stale project (changed in flight) still places at the captured start on the track chosen at placement time', async () => {
    s().setPlayhead(2);
    let resolve!: () => void;
    const gate = new Promise<void>((r) => (resolve = r));
    synth = async () => (await gate, new Blob(['mp3']));
    const pending = run();
    await vi.waitFor(() => expect(log.calls).toHaveLength(1));
    s().apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.kind === 'audio' ? { ...t, clips: [{ ...lockedClip(), out: 1 }] } : t)) }));
    resolve();
    expect(await pending).toBe(true);
    const [t0, t1] = audioTracks();
    expect(t1).toBeUndefined(); // the existing clip (0..1) leaves room at 2, so no new track is needed
    const voice = t0.clips.find((c) => c.mediaId !== 'x');
    expect(t0.clips).toHaveLength(2);
    expect(voice?.start).toBe(2);
  });

  it('a refused placement removes the media, toasts the plain message and leaves the project unchanged', async () => {
    for (let i = 0; i < 7; i++) s().apply((p) => addTrack(p, 'audio'));
    s().apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.kind === 'audio' ? { ...t, locked: true, clips: [lockedClip()] } : t)),
    }));
    const before = present();
    const depth = s().history.past.length;
    expect(await run()).toBe(false);
    expect(log.removed).toEqual(['m1']);
    expect(present()).toBe(before);
    expect(s().history.past).toHaveLength(depth);
    expect(toasts()).toEqual(['At most 8 audio tracks']);
  });

  it('a double call sends only one request', async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((r) => (resolve = r));
    synth = async () => (await gate, new Blob(['mp3']));
    const a = run();
    const b = run();
    expect(await b).toBe(false);
    resolve();
    expect(await a).toBe(true);
    expect(log.calls).toEqual(['synthesize']);
    expect(s().history.past).toHaveLength(1);
  });

  it('aborting mid-request adds no media and shows no toast', async () => {
    const ctl = new AbortController();
    synth = (_r, signal) =>
      new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new ElevenLabsError('aborted'))));
    const pending = run(REQ, ctl.signal);
    await vi.waitFor(() => expect(log.calls).toHaveLength(1));
    ctl.abort();
    expect(await pending).toBe(false);
    expect(log.imported).toEqual([]);
    expect(Object.keys(present().media)).toHaveLength(0);
    expect(toasts()).toEqual([]);
    synth = async () => new Blob(['mp3']);
    expect(await run()).toBe(true); // an aborted call frees the guard
  });

  it('aborting after the audio arrived but before placement removes the imported media', async () => {
    const ctl = new AbortController();
    const d = deps();
    const origImport = d.importFile;
    d.importFile = async (f) => {
      const m = await origImport(f);
      ctl.abort();
      return m;
    };
    expect(await generateVoiceOver(REQ, ctl.signal, d)).toBe(false);
    expect(log.removed).toEqual(['m1']);
    expect(Object.keys(present().media)).toHaveLength(0);
  });

  it('shows the plain ElevenLabs message for API failures and changes nothing', async () => {
    synth = async () => {
      throw new ElevenLabsError('quota');
    };
    expect(await run()).toBe(false);
    expect(toasts()).toEqual([new ElevenLabsError('quota').message]);
    expect(s().history.past).toHaveLength(0);
    expect(log.imported).toEqual([]);
  });

  it('never surfaces an unknown error text (allow-list): a leaked key stays out of toasts and logs', async () => {
    synth = async () => {
      throw new Error(`boom ${KEY}`);
    };
    expect(await run()).toBe(false);
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(toasts().join('|')).not.toContain(KEY);
    expect(logged).not.toContain(KEY);
    expect(toasts()).toHaveLength(1);
  });

  it('a cancel followed by an import failure shows no toast and leaves no media', async () => {
    const ctl = new AbortController();
    const d = deps();
    d.importFile = async () => {
      ctl.abort();
      throw new Error('import failed');
    };
    expect(await generateVoiceOver(REQ, ctl.signal, d)).toBe(false);
    expect(toasts()).toEqual([]);
    expect(Object.keys(present().media)).toHaveLength(0);
  });
});
