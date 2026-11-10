import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = fileURLToPath(new URL('./.fixtures', import.meta.url));

const VIDEO_SRC = ['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30'];
const VIDEO_ENC = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'];

/**
 * 128x72 frames split into quadrants: top-left red, top-right green, bottom-left blue, bottom-right white. Every
 * rotation and flip of it is distinguishable, so orientation tests can tell clockwise from counter-clockwise.
 */
const QUADRANTS =
  "color=black:s=128x72:r=30:d=1,format=rgb24,geq=r='if(lt(X\\,W/2)\\,if(lt(Y\\,H/2)\\,255\\,0)\\,if(lt(Y\\,H/2)\\,0\\,255))'" +
  ":g='if(gte(X\\,W/2)\\,255\\,0)':b='if(gte(Y\\,H/2)\\,255\\,0)'";

/** Clockwise display rotation (as Mediabunny reports it) → the rotated quadrant fixture's file name. */
export const ROTATED: Record<90 | 180 | 270, string> = {
  90: 'quad-cw90.mp4',
  180: 'quad-cw180.mp4',
  270: 'quad-cw270.mp4',
};

function ffmpeg(args: string[]): void {
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'pipe' });
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: Buffer };
    if (err.code === 'ENOENT') throw new Error('ffmpeg is needed to generate the e2e fixtures but is not installed');
    throw new Error(`ffmpeg failed: ${err.stderr?.toString() ?? err.message}`);
  }
}

/** Writes `out` via a temp file renamed into place, so an interrupted run never leaves a half-written fixture. */
function generate(out: string, make: (tmp: string) => void): void {
  if (existsSync(out)) return;
  const tmp = `${out}.part${out.slice(out.lastIndexOf('.'))}`;
  rmSync(tmp, { force: true });
  make(tmp);
  renameSync(tmp, out);
}

const encode = (out: string, args: string[]): void => generate(out, (tmp) => ffmpeg([...args, tmp]));

/** Generates the e2e media fixtures if missing and returns their directory. */
export function ensureFixtures(): string {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const at = (name: string): string => join(FIXTURE_DIR, name);
  encode(at('with-audio.mp4'), [
    ...VIDEO_SRC,
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '3', ...VIDEO_ENC, '-c:a', 'aac', '-shortest',
  ]);
  encode(at('no-audio.mp4'), [...VIDEO_SRC, '-t', '2', ...VIDEO_ENC, '-an']);
  encode(at('tone.wav'), [
    '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000', '-t', '2', '-c:a', 'pcm_s16le',
  ]);
  // Ten minutes of 8 kHz mono AAC: cheap, but long enough that decoding it whole is measurably slow.
  encode(at('long-tone.m4a'), [
    '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=8000', '-t', '600', '-c:a', 'aac', '-b:a', '24k', '-ac', '1',
  ]);
  encode(at('fps25.mp4'), ['-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=25', '-t', '2', ...VIDEO_ENC, '-an']);
  encode(at('quad.mp4'), ['-f', 'lavfi', '-i', QUADRANTS, ...VIDEO_ENC, '-an']);
  for (const [cw, name] of Object.entries(ROTATED)) {
    // ffmpeg's -display_rotation is counter-clockwise.
    encode(at(name), ['-display_rotation', String(360 - Number(cw)), '-i', at('quad.mp4'), '-c', 'copy']);
  }
  // Mirrored (horizontal flip after rotation) variants; ffmpeg's -display_hflip writes the display matrix.
  encode(at('quad-hflip.mp4'), ['-display_hflip', '-i', at('quad.mp4'), '-c', 'copy']);
  encode(at('quad-cw90-hflip.mp4'), ['-display_rotation', '270', '-display_hflip', '-i', at('quad.mp4'), '-c', 'copy']);
  // 160x80 still: left half red, right half blue (an asymmetric overlay for the layers journey).
  encode(at('journey.png'), [
    '-f', 'lavfi', '-i', 'color=c=red:s=80x80', '-f', 'lavfi', '-i', 'color=c=blue:s=80x80',
    '-filter_complex', 'hstack', '-frames:v', '1',
  ]);
  // Valid files in containers ClipForge cannot open.
  encode(at('legacy.avi'), ['-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=25', '-t', '0.5', '-c:v', 'mpeg4']);
  encode(at('legacy.wmv'), ['-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=25', '-t', '0.5', '-c:v', 'wmv2']);
  // The first 2 KB of a real MP4: a recognisable but damaged container (no moov box).
  generate(at('truncated.mp4'), (tmp) => writeFileSync(tmp, readFileSync(at('with-audio.mp4')).subarray(0, 2048)));
  return FIXTURE_DIR;
}

/** Decodes frame `index` of `file` with ffmpeg (which applies display rotation) into packed RGB. */
export function ffmpegFrame(file: string, index = 0): { width: number; height: number; rgb: Buffer } {
  const probe = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation',
    '-of', 'json', file,
  ]).toString();
  const s = JSON.parse(probe).streams[0] as { width: number; height: number; side_data_list?: { rotation?: number }[] };
  const rot = Math.abs(s.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0) % 180;
  const [width, height] = rot === 90 ? [s.height, s.width] : [s.width, s.height];
  const rgb = execFileSync('ffmpeg', [
    '-v', 'error', '-i', file, '-vf', `select=eq(n\\,${index})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ], { maxBuffer: 64 << 20 });
  return { width, height, rgb };
}
