import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { KEY, openSettings, saveKey } from './ai-settings-helpers';

export { KEY };

/** A real 1-second MP3 (a 330 Hz tone) made with ffmpeg; the stub returns it as the "synthesized speech". */
const mp3Path = join(mkdtempSync(join(tmpdir(), 'ai-voice-')), 'speech.mp3');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=1:sample_rate=44100', '-ac', '1', '-b:a', '64k', mp3Path]);
export const speech = (): Buffer => readFileSync(mp3Path);

export type Mode = 'ok' | 'slow' | 401 | 402 | 429 | 'network';

export interface Tts {
  mode: Mode;
  /** Parsed JSON body and key header of every text-to-speech request. */
  calls: { url: string; body: unknown; key: string | undefined }[];
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

/** Stubs api.elevenlabs.io (the real API is never called). `slow` holds the speech response for 3 s. */
export async function stubTts(page: Page): Promise<Tts> {
  const tts: Tts = { mode: 'ok', calls: [] };
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  await page.route('https://api.elevenlabs.io/**', async (route) => {
    const req: Request = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.url().includes('/v1/voices')) {
      return route.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify({ voices: [{ voice_id: 'v1', name: 'Rachel' }, { voice_id: 'v2', name: 'Adam' }] }) });
    }
    if (req.url().includes('/v1/user/subscription')) {
      return route.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify({ character_count: 1, character_limit: 10000 }) });
    }
    tts.calls.push({ url: req.url(), body: req.postDataJSON(), key: req.headers()['xi-api-key'] });
    if (tts.mode === 'network') return route.abort('failed');
    if (typeof tts.mode === 'number') {
      return route.fulfill({ status: tts.mode, headers: cors, contentType: 'application/json', body: JSON.stringify({ detail: { status: 'x' } }) });
    }
    if (tts.mode === 'slow') await new Promise((r) => setTimeout(r, 3000));
    return route.fulfill({ headers: cors, contentType: 'audio/mpeg', body: speech() });
  });
  return tts;
}

/** Saves the key through Settings (as a user would), then closes Settings. */
export async function addKey(page: Page): Promise<void> {
  await openSettings(page);
  await saveKey(page);
  await page.getByTestId('settings-done').click();
  await expect(page.getByTestId('settings-dialog')).toHaveCount(0);
}

export async function openDialog(page: Page): Promise<void> {
  await page.getByTestId('btn-ai-voice').click();
  await expect(page.getByTestId('ai-voice-dialog')).toBeVisible();
  await expect(page.getByTestId('ai-voice-voice')).toBeEnabled();
}

export const snapshot = (page: Page) =>
  page.evaluate(() => {
    const s = window.__clipforge!.getState();
    return { present: JSON.stringify(s.history.present), depth: s.history.past.length };
  });

/** Overall RMS (dB) of the first audio stream, and its codec, via ffmpeg/ffprobe. */
export function audioInfo(path: string): { rms: number; codec: string } {
  const codec = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', path], { encoding: 'utf8' }).stdout.trim();
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-map', '0:a:0', '-af', 'astats', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /RMS level dB:\s*(-?[\d.]+|-inf)/.exec(r.stderr.slice(r.stderr.lastIndexOf('Overall')));
  return { codec, rms: !m || m[1] === '-inf' ? -Infinity : Number(m[1]) };
}
