// Retimes the decoded footage of one segment into the clip's virtual speed-1 source (Plan 5D Task 8): the buffer returned
// covers the global virtual samples [round(vFrom * rate), round(vTo * rate)) and `start` is the time of its first sample, so
// the engines schedule it exactly like a decoded source range.
import type { Clip } from '../../core/model';
import type { DecodedAudio } from '../../media/audioDecode';
import { noteAudioBuffer } from '../stats';
import { resample } from './resample';

export function retimeBuffer(clip: Clip, src: DecodedAudio, vFrom: number, vTo: number, ctx: BaseAudioContext): DecodedAudio {
  const rate = src.buffer.sampleRate;
  const first = Math.round(vFrom * rate);
  const length = Math.max(1, Math.round(vTo * rate) - first);
  const input = Array.from({ length: src.buffer.numberOfChannels }, (_, c) => src.buffer.getChannelData(c));
  const out = resample({ clip, input, inFirst: Math.round(src.start * rate), rate, outFirst: first, outLength: length });
  const buffer = ctx.createBuffer(out.length, length, rate);
  out.forEach((data, c) => buffer.copyToChannel(data as Float32Array<ArrayBuffer>, c));
  noteAudioBuffer(buffer);
  return { buffer, start: first / rate };
}
