import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = fileURLToPath(new URL('./.fixtures', import.meta.url));

const VIDEO_SRC = ['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30'];
const VIDEO_ENC = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'];

function generate(out: string, args: string[]): void {
  if (existsSync(out)) return;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, out], { stdio: 'pipe' });
}

/** Generates the e2e media fixtures if missing and returns their directory. */
export function ensureFixtures(): string {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  generate(join(FIXTURE_DIR, 'with-audio.mp4'), [
    ...VIDEO_SRC,
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '3', ...VIDEO_ENC, '-c:a', 'aac', '-shortest',
  ]);
  generate(join(FIXTURE_DIR, 'no-audio.mp4'), [...VIDEO_SRC, '-t', '2', ...VIDEO_ENC, '-an']);
  generate(join(FIXTURE_DIR, 'tone.wav'), [
    '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000', '-t', '2', '-c:a', 'pcm_s16le',
  ]);
  return FIXTURE_DIR;
}
