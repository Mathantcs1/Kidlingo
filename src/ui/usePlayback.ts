import { useEffect } from 'react';
import { create } from 'zustand';
import { sharedAudioContext } from '../audio/context';
import type { Mixer } from '../audio/mixer';
import { timelineDuration } from '../core/timeline';
import { useEditor } from '../state/store';
import { playStart, playbackTick } from './playbackTime';
import { showError } from './Toast';
import { ChunkLoadError, loadChunk } from '../loadChunk';

/** True while Play waits for the mixer to decode and schedule the first audio window (aria-busy on Play). */
export const usePlaybackStatus = create<{ buffering: boolean }>()(() => ({ buffering: false }));

const editor = () => useEditor.getState();

/**
 * Connects the store's `playing` flag to audio playback. Starting plays the project's audio through the mixer
 * from the playhead (restarting from 0 at the end) and, once the mixer has scheduled its first window, moves the playhead
 * every animation frame from the mixer's AudioContext clock, stopping by itself at the end of the timeline.
 *
 * Any edit (a history.present change, which includes format changes, undo and redo) while playing pauses
 * playback first: the scheduled audio was built from the old project and would no longer match it.
 */
export function usePlayback(): void {
  useEffect(() => {
    let mixer: Mixer | null = null;
    let raf = 0;
    /** Bumped on every start/stop so a superseded start never takes over the playhead. */
    let generation = 0;
    let disposed = false;

    const halt = (): void => {
      generation++;
      cancelAnimationFrame(raf);
      raf = 0;
      mixer?.stop();
      usePlaybackStatus.setState({ buffering: false });
    };

    /** A later audio window failed to decode: say so and stop. */
    const fail = (e: unknown): void => {
      console.error('clipforge: playback failed', e);
      showError(`Could not play: ${e instanceof Error ? e.message : String(e)}`);
      editor().setPlaying(false);
    };

    const start = async (): Promise<void> => {
      const gen = ++generation;
      const { history, playhead, setPlaying, setPlayhead } = editor();
      const p = history.present;
      const duration = timelineDuration(p);
      const from = playStart(playhead, duration);
      if (from === null) {
        showError('Nothing to play');
        setPlaying(false);
        return;
      }
      if (from !== playhead) setPlayhead(from);
      usePlaybackStatus.setState({ buffering: true });
      try {
        if (!mixer) {
          // Loaded on first use so the media toolkit stays out of the startup bundle. The context is the one
          // the Play gesture created and resumed (see togglePlay).
          const { createMixer } = await loadChunk(() => import('../audio/mixer'));
          if (disposed || gen !== generation) return;
          mixer = createMixer({ context: sharedAudioContext, onError: fail });
        }
        await mixer.play(p, from);
      } catch (e) {
        if (disposed || gen !== generation) return;
        console.error('clipforge: playback failed', e);
        usePlaybackStatus.setState({ buffering: false });
        showError(e instanceof ChunkLoadError ? e.message : `Could not play: ${e instanceof Error ? e.message : String(e)}`);
        editor().setPlaying(false);
        return;
      }
      if (disposed || gen !== generation) return;
      usePlaybackStatus.setState({ buffering: false });
      const frame = (): void => {
        if (gen !== generation || !mixer) return;
        const { t, ended } = playbackTick(mixer.currentTime(), duration);
        editor().setPlayhead(t);
        if (ended) editor().setPlaying(false);
        else raf = requestAnimationFrame(frame);
      };
      frame();
    };

    const unsubscribe = useEditor.subscribe((s, prev) => {
      if (s.playing && s.history.present !== prev.history.present) {
        // Pause on any edit (see above); the playing flag change below then stops the audio.
        s.setPlaying(false);
        return;
      }
      if (s.playing === prev.playing) return;
      if (s.playing) void start();
      else halt();
    });

    return () => {
      disposed = true;
      unsubscribe();
      halt();
      if (editor().playing) editor().setPlaying(false);
    };
  }, []);
}
