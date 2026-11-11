# ClipForge Plan 3 (audio editing): manual QA in real Chrome on a Mac

Run `npm run dev` on branch `claude/quirky-cannon-7vz48u`, open http://localhost:5173 in desktop Chrome, and wear
headphones for items 1-8. Use a real phone clip with speech, a music file (MP3/M4A) and a good microphone. Nothing
from Plan 3 has been heard in a real browser yet; the automated tests measure signals, not how it sounds. Tick each
item; note anything odd.

1. **Fades.** Put the music on an audio track. In the Inspector set Fade in 2 s and Fade out 2 s. Play from the start
   and across the end: a smooth rise and fall with no click at the clip edges. Undo each (one step per field).
2. **Pan (balance law).** Select the music clip, set Pan to -100 %, then +100 %. Hard left: you hear it only in the
   left ear, at the SAME loudness the left side had at centre (the far channel is dropped, the near one is not
   boosted or cut). At 0 % both sides are unchanged. A mono file at hard left still plays at normal level on that side.
3. **Track volume.** Drag the volume slider in an audio track header: the whole track gets quieter/louder live while
   playing, and the clip volume in the Inspector still works on top of it. Check the header layout in item 12.
4. **Effects, one by one.** On a speech clip add each effect from **Add effect** and play: **EQ** (push High +12: tinny;
   Low +12: boomy), **High-pass** (thin, no rumble), **Low-pass** (muffled), **Compressor** (loud parts evened out),
   **Reverb** (a room), **Echo** (distinct repeats; try high feedback and Mix 100 %: no harsh clipping or runaway),
   **Gain**, **Pitch** (+/- semitones, speech stays at the same speed), **Noise reduction** (see item 5). Each toggle
   off/on is audible at once. A tail (reverb/echo) stops at the clip end; that is expected.
5. **Noise reduction.** Use a clip with steady hiss or fan noise and about a second of "room tone" before the voice:
   Noise reduction lowers the hiss without making the voice watery. A clip that is only noise is left unchanged.
   The first Play of a denoised clip may wait about half a second (it analyses the audio); it must not freeze the page.
6. **Presets and Normalise.** Apply Podcast voice, Radio, Telephone, Deep voice and Chipmunk: each sounds like its
   name, and the effects it adds show in the list and can be edited. **Normalise** raises a quiet clip so its peak is
   near full scale (check the waveform got taller; the result is one effect you can switch off).
7. **Split restarts effects.** Split an effect clip in the middle of a reverb/echo tail: the second half starts
   "cold" (no tail from the first half). Expected, listed in the README limits.
8. **Waveforms and zoom.** Waveforms appear on audio clips (and a thin strip on video clips with sound). Zoom the
   timeline all the way in and out: the shape stays aligned with what you hear (a clap lines up with its peak at the
   playhead), trimmed clips show only their visible part, and the waveform redraws sharply after a window resize.
9. **Detach / Attach back.** Select a video with sound, click **Detach audio**: the video clip shows a detached
   badge, an audio clip appears on an audio track with the same sound, and playback is not doubled. **Attach back** is
   offered only while the twin is unedited (move, trim, fade or effect on it hides the button; one undo also restores).
10. **Auto-ducking by ear.** Put the voice on one audio track and music on another. In the music track header
    open the D (duck) button, choose the voice track as the source. Play: the music dips under the voice CLIP and
    comes back after it (attack/release as set); change Amount/Attack/Release and hear the difference. Ducking follows
    where the voice clip is, not whether someone is speaking (a pause inside the clip does not bring the music back).
    A muted voice track does not duck.
11. **Microphone permission.** First **Record**: Chrome asks; **Allow** and a timer starts. Reload, block the
    microphone for the site in the address bar, press Record: a clear "blocked" message with how to fix it. Re-allow
    via the lock icon, site settings, microphone: Record works again without reloading. Start a call (or another app)
    that holds the microphone: the app reports it as in use, not a crash.
12. **Voice-over: headphones and speakers.** With **Play along** on and headphones, record over the picture: the
    take lands at the playhead on the active audio track (one undo step) and sounds clean. Without headphones the
    microphone picks up the playback (echo/feedback): expected, the UI advises headphones. The voice may land slightly
    early against the picture (microphone latency, tens of ms; there is no compensation). Try Play along off too.
13. **Esc and limits while recording.** Esc during a take under 5 s discards it; over 5 s it asks first. Export and
    Merge all are unavailable while recording, and closing the tab asks first. (Optional, long: a take stops by itself
    at 30 minutes and keeps what was recorded.)
14. **Export matches the preview.** Build a project with fades, an EQ + compressor on the voice, ducked music and a
    voice-over; export 1080p. Open the MP4 in **QuickTime Player** (and VLC if available): it plays, the length
    matches the timeline, and the audio sounds like the preview (fades, effects, ducking, pan). Check a pitch-shifted
    and a denoised clip too: export renders them in full, not the live approximation.
15. **Audio track header layout.** Never seen visually before. Add audio tracks up to 8: each header is two lines
    (name and M/S/lock/remove, then the volume slider and the D button), nothing overlaps or clips at the 8-track
    height, the duck popover opens beside its button, closes on scroll/resize/Esc, and the timeline rows still line
    up with their headers. Also check the Inspector's audio section at a narrow window width.
16. **Persistence.** Reload after all of the above: fades, pan, effect lists and their on/off state, track volumes,
    duck settings, recorded takes and waveforms are all back; Undo history is empty (expected).
17. **Safari 17+ (unverified).** If you try it, expect gaps: microphone recording (interruptions, track mute),
    AudioWorklet timing, and `AudioDecoder`/OPFS writable files (see the README). Note what happens; do not rely on it.
