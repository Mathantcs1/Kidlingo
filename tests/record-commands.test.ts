import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProject } from '../src/core/model';
import type { MediaRef, Project } from '../src/core/model';
import { RecorderError } from '../src/media/recorder';
import { useEditor } from '../src/state/store';
import { useExportUi } from '../src/ui/exportJobState';
import { useToasts } from '../src/ui/Toast';

const fake = vi.hoisted(() => ({
  start: null as null | (() => Promise<void>),
  seconds: 2,
  created: 0,
  cancel: null as unknown as ReturnType<typeof vi.fn>,
  rec: null as null | { onLimit: (() => void) | null; onEnded: (() => void) | null },
  imported: [] as string[],
  removed: [] as string[],
}));

vi.mock('../src/media/recorder', async (orig) => {
  const actual = await orig<typeof import('../src/media/recorder')>();
  return {
    ...actual,
    createRecorder: () => {
      fake.created++;
      const rec = {
        start: () => (fake.start ? fake.start() : Promise.resolve()),
        stop: async () => ({ blob: new Blob(['wav']), seconds: fake.seconds, sampleRate: 48000 }),
        cancel: fake.cancel,
        elapsed: () => 1.5,
        state: () => 'recording' as const,
        onLimit: null,
        onEnded: null,
      };
      fake.rec = rec;
      return rec;
    },
  };
});
vi.mock('../src/media/import', () => ({
  importFile: async (f: File): Promise<MediaRef> => {
    fake.imported.push(f.name);
    return { id: `m${fake.imported.length}`, name: f.name, kind: 'audio', duration: fake.seconds, hasAudio: true };
  },
}));
vi.mock('../src/media/storage', () => ({
  removeMedia: async (id: string) => {
    fake.removed.push(id);
  },
}));

const { cancelRecording, recordVoiceOver, setPlayAlong, useRecording } = await import('../src/ui/recordCommands');

const s = () => useEditor.getState();
const present = (): Project => s().history.present;
const depth = (): number => s().history.past.length;
const status = () => useRecording.getState().status;
const toasts = (): string[] => useToasts.getState().toasts.map((x) => x.message);
const audioTracks = () => present().tracks.filter((t) => t.kind === 'audio');

async function recordUntilIdle(): Promise<void> {
  recordVoiceOver();
  await vi.waitFor(() => expect(status()).toBe('recording'));
  recordVoiceOver();
  await vi.waitFor(() => expect(status()).toBe('idle'));
}

beforeEach(() => {
  s().loadProject(emptyProject());
  useToasts.setState({ toasts: [] });
  useExportUi.setState({ open: null });
  setPlayAlong(true);
  Object.assign(fake, { start: null, seconds: 2, created: 0, cancel: vi.fn(), rec: null, imported: [], removed: [] });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('recordVoiceOver', () => {
  it('records from the playhead, plays along, and places the take in ONE undo step', async () => {
    s().setPlayhead(4);
    recordVoiceOver();
    await vi.waitFor(() => expect(status()).toBe('recording'));
    expect(s().playing).toBe(true);
    s().setPlayhead(6.2); // playback moves on while recording
    recordVoiceOver();
    await vi.waitFor(() => expect(status()).toBe('idle'));
    expect(s().playing).toBe(false);
    expect(depth()).toBe(1);
    expect(fake.imported).toEqual(['Voice-over 1.wav']);
    const [m] = Object.values(present().media);
    expect(m.name).toBe('Voice-over 1');
    expect(audioTracks()).toHaveLength(1);
    expect(audioTracks()[0].clips[0]).toMatchObject({ mediaId: m.id, start: 4, in: 0, out: 2 });
    s().undo();
    expect(present().media).toEqual({});
  });

  it('numbers takes and leaves playback alone when Play along is off', async () => {
    setPlayAlong(false);
    await recordUntilIdle();
    expect(s().playing).toBe(false);
    s().setPlayhead(10);
    await recordUntilIdle();
    expect(Object.values(present().media).map((m) => m.name).sort()).toEqual(['Voice-over 1', 'Voice-over 2']);
    expect(depth()).toBe(2);
  });

  it('puts the take on a new audio track when the active audio track is locked', async () => {
    const id = audioTracks()[0].id;
    s().apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, locked: true } : t)) }));
    s().setActiveTrack(id);
    await recordUntilIdle();
    expect(audioTracks()).toHaveLength(2);
    expect(audioTracks()[1].clips).toHaveLength(1);
    expect(depth()).toBe(2);
  });

  it('a refused microphone shows the plain-English toast and leaves the project untouched', async () => {
    fake.start = () => Promise.reject(new RecorderError('denied'));
    const before = present();
    recordVoiceOver();
    await vi.waitFor(() => expect(status()).toBe('idle'));
    expect(present()).toBe(before);
    expect(s().playing).toBe(false);
    expect(toasts()).toEqual([
      "Microphone access was blocked. Allow it for this site in the browser's address bar, then try again.",
    ]);
  });

  it('cancel discards the take: no import, no undo step, playback stopped', async () => {
    recordVoiceOver();
    await vi.waitFor(() => expect(status()).toBe('recording'));
    cancelRecording();
    expect(fake.cancel).toHaveBeenCalledTimes(1);
    expect(status()).toBe('idle');
    expect(s().playing).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(fake.imported).toEqual([]);
    expect(depth()).toBe(0);
  });

  it('the 30-minute limit keeps the take and says so', async () => {
    recordVoiceOver();
    await vi.waitFor(() => expect(status()).toBe('recording'));
    fake.rec?.onLimit?.();
    await vi.waitFor(() => expect(status()).toBe('idle'));
    expect(depth()).toBe(1);
    expect(toasts().join(' ')).toMatch(/30-minute limit/);
  });

  it('does nothing while an export or merge dialog is open', () => {
    useExportUi.setState({ open: 'export' });
    recordVoiceOver();
    expect(fake.created).toBe(0);
    expect(status()).toBe('idle');
  });

  it('removes the stored file when the take cannot be placed', async () => {
    s().apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.kind === 'audio' ? { ...t, locked: true } : t)) }));
    for (let i = 0; i < 7; i++) s().apply((p) => ({ ...p, tracks: [...p.tracks, { ...p.tracks[1], id: `a${i}` }] }));
    const before = present();
    await recordUntilIdle();
    expect(present()).toBe(before);
    expect(fake.removed).toEqual(['m1']);
    expect(toasts().join(' ')).toMatch(/At most 8 audio/);
  });
});
