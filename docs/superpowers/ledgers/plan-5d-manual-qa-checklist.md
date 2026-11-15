# Plan 5D manual QA (speed, reverse, ramps, freeze frame)

Run on a real Mac (Chrome and Safari) after the headless checks; none of this is verified on real hardware yet.

## Audio quality (listen with headphones)
- Speech clip at 50 %, 75 %, 150 %, 200 % with Preserve pitch ON: voice pitch unchanged, no phasing or flutter; compare with OFF (pitch moves).
- Music clip at 25 % and 400 %: note the smearing of drum hits (a known WSOLA limit) and a faint seam every 2 s; acceptable?
- Reverse of speech and of music: clean mirror, no clicks at the start or end.
- A speed ramp (Bullet time) on a clip with speech: pitch steady through the slow part.
- Split a stretched clip at a whole frame and play across the cut: no click, no repeated or skipped sound.
- The Pitch audio effect on a 50 % clip: shifts by its semitones on top of the stretch.

## Picture
- Reverse of a long clip from a phone (key frame every 2 s) and of a screen recording (key frame every 10 s): playback smoothness in the preview (dropped frames are expected), exact in the export.
- 4 K reverse: memory stays reasonable (Activity Monitor), no tab crash.
- Freeze frame: picture identical to the frame at the playhead; the clip after it moves later.
- Keyframed scale on a 200 % clip and on a reversed clip: the animation squeezes / mirrors as described in Help.

## Sync and export
- Export 1080p of a retimed clip and open it in QuickTime and in the Photos app: duration, A/V sync (clap test) at 50 %, 200 %, reverse.
- Reload the project: retimed clips come back with the same speed and badge.

## Data
- Open a v8 project: it opens unchanged. Open a v9 project in an older open tab: "saved by a newer version" and the data is untouched.
