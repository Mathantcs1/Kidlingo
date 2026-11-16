import { crossfadeInfo } from '../audio/crossfade';
import { audibleClips } from '../audio/plan';
import type { Clip, Project } from '../core/model';

/**
 * Which of the clip's own audio fades a transition replaces: 'in', 'out', 'both' or '' (none). The crossfade is the fade only when
 * both clips of the transition can sound (a detached, muted or picture-only partner leaves the clip its own fades).
 */
export function fadeReplaced(p: Project, clip: Clip): 'in' | 'out' | 'both' | '' {
  const info = crossfadeInfo(p, audibleClips(p)).get(clip.id);
  const fadeIn = (info?.before ?? 0) > 0 && clip.audio.fadeIn > 0;
  const fadeOut = (info?.after ?? 0) > 0 && clip.audio.fadeOut > 0;
  return fadeIn && fadeOut ? 'both' : fadeIn ? 'in' : fadeOut ? 'out' : '';
}
