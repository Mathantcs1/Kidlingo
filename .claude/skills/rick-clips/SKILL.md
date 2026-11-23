---
name: rick-clips
description: Make a finished, narrated, cinematic YouTube video (Shorts or long-form) on ANY topic in the Rick Clips style: hand-sketched 2.5D scenes, a professional-style moving camera, word-by-word captions, voice-over, music and subtitles, all made in code with no video model. Use when the user wants a video, short, explainer or parable made from a topic or script, wants a storyboard for one, or says "Rick Clips". Runs the same process every time: brief → story → storyboard → script → voice → render → checks → upload-ready files.
---

# Rick Clips: any topic in, finished cinematic video out

Flat hand-sketched characters in layered 2.5D scenes (graphite line, offset colour, paper grain) shot by a moving camera, cut on the spoken words, with one hand-lettered caption word at a time. Everything is drawn, voiced, scored and mixed by code (no video-generation model, no stock footage). **The process below is identical for every topic; only the story and storyboard change.** Stories and characters are always original (never copy someone else's story, characters, handle or interface).

`RC` = the folder containing this SKILL.md. The engine is `$RC/engine`. Guides: `$RC/reference/` (ENGINE.md = every directive, scene, camera, transition; ADDING-SCENES.md; LESSONS.md). A finished example: `$RC/examples/brandwake-promise/`.

## 0. Once per machine
```sh
sh $RC/engine/skill/stickset/scripts/doctor.sh --install   # Node>=20, ffmpeg>=7 (static build fetched on Linux), Python>=3.11; clones the MIT Lemo-Opuscar library to ~/lemo-opuscar and installs its voice/render deps (~0.9 GB)
export LEMO_OPUSCAR_HOME=$HOME/lemo-opuscar; export PROJECT=$PWD/rick-clips-project   # where films will live
```
macOS with a GPU: `brew install ffmpeg`, and set `LEMO_ANGLE=metal` before building (much faster). On a machine with no GPU it renders in software (~0.15 s per 1080x1920 frame); a 35 s short takes ~5 min, an 8 min long-form ~70 min: run those builds in the background and do not poll.

## 1. Brief (ask once, in one message)
Topic; channel (use `--channel general`, or a profile in `$RC/engine/skill/stickset/profiles/`: copy `TEMPLATE.md.example`, fill it from the owner's OWN words, set `STATUS: READY`; never invent a channel's tone or cast); format `short` (1080x1920, 30 fps, 30-60 s) or `long` (1920x1080, 24 fps, 2-8 min, rendered in resumable chapters); language (voice is offline English; narration in the language of the request). If the user already gave these, do not ask again.

## 2. Story first (GATE: show it, wait for approval before building)
Write the story as 6-10 numbered lines (about 80-100 words for 35 s): **hook in the first 3 seconds, one subject with one want, one turn, an ending that echoes the opening**, a one-line moral. Say which scenes it needs. Do not build until the user approves or edits it.

## 3. Storyboard (the step that makes it feel like a film)
Make a table: **phrase | scene | camera | look/insert**. Rules (the build enforces them and stops on violations):
- **Scenes follow the voice-over.** Every phrase gets the place that shows what it says; never re-zoom two rooms. A ~35 s film needs >= 5 different scenes (1 per ~7 s), none over 40 % of the shots.
- **A shot about every 1-1.5 s**, cut ON a spoken word. A shot under 0.5 s is refused.
- **The camera changes every cut** and the same scene+camera never repeats within 4 shots. Mix shot sizes: open on an establishing wide, punctuate with extreme close-up inserts (`look=`), never 4 of one size in a row, end on a wide.
- Each boundary gets a script-chosen transition (set change inside a line: whip/scribble/ink; new narration line: page flip; same-set close-up: ink); hard cut only with `cut=cut`.
If the story needs a place or person that does not exist, add it first (`$RC/reference/ADDING-SCENES.md`); never fake it with a re-zoom.

## 4. Script, scaffold, voice, checks
```sh
STICKSET_ROOT=$PROJECT sh $RC/engine/skill/stickset/scripts/new-film.sh <name> --channel general --format short --style sketch
```
Edit `$PROJECT/films/<name>/script.md`: one `[set=… cam=… face=… cast=…]` line per narration line followed by its text (no beats yet), and write the storyboard from step 3 as `storyboard.json`: one array per narration line, one object per shot (`{"set":"desk","cam":"tiltup","cast":["rosa"],"look":"card"}`; keys: set cam face cast look frame cut). **Draft once to generate the voice** (the build stops at the storyboard lint, after the voice step, because the lines have no beats yet), then let the tool cut each line into its shots at natural phrase breaks using the measured word times:
```sh
LIB=$LEMO_OPUSCAR_HOME sh $PROJECT/films/<name>/build.sh draft        # stops at the lint; voice is now generated
node $RC/engine/skill/stickset/scripts/place-beats.mjs $PROJECT/films/<name> $PROJECT/films/<name>/storyboard.json   # rewrites script.md with inline {beats} (backup kept)
LIB=$LEMO_OPUSCAR_HOME sh $PROJECT/films/<name>/build.sh draft        # now it renders
```
Beats can also be written by hand: `{set=desk look=card cam=push}` right before the word that starts the new shot (see ENGINE.md); the tool just does it from the measured times.
`build.sh` runs, in order: voice (offline Kokoro) → speech-to-text check of every line (it must pass word for word: reword a line that is misheard instead of overriding the check) → timeline + cue-map (every shot change on a word start) → **storyboard lint** → render → mix (voice, ambience per scene, foley per transition/camera, ducked score) → mux at -14 LUFS → `subtitles_en.srt`. It prints a render-time estimate and **stops past 2 hours** (rerun with `CONFIRM_LONG_RENDER=1` only if the user agrees).

## 5. Review like a director (never trust green tests alone)
Extract frames and LOOK: one frame per shot as a contact sheet (does each picture show its phrase? are heads in frame?), and a strip of 6 frames around 3-4 transitions of different types (are they visible, crisp, centred on the word?). Fix the script, rebuild the draft. Typical fixes: move a beat, change a scene/camera, reword a line.

## 6. Final build and delivery checks
```sh
LIB=$LEMO_OPUSCAR_HOME sh $PROJECT/films/<name>/build.sh          # full resolution
sh $RC/engine/skill/stickset/scripts/check-video.sh <film.mp4> 1080 1920 30 <seconds>   # size, fps, duration, no black frames
$LEMO_OPUSCAR_HOME/.venv/bin/python $RC/engine/tests/sharpness.py <film.mp4> <timeline.json>   # transitions must stay crisp (whips > ~0.8)
cd $RC/engine && LEMO_OPUSCAR_HOME=$LEMO_OPUSCAR_HOME node --test tests/*.test.mjs             # engine self-test incl. a render smoke test
```
Loudness must read about -14 LUFS (the mux prints it). Deliver: `film-*.mp4`, `subtitles_en.srt`, a poster frame, `metadata.md` filled for the channel (title <= 70 chars hook first, description, 10-15 tags, 3 hashtags, thumbnail concept: face close-up + <= 3 words, call to action), and `CREDITS` (three.js is not used here; Kokoro voice Apache-2.0, Lemo-Opuscar MIT, fonts Liberation Sans / DejaVu). Tell the user where the files are and that they are responsible for any material they add.

## 7. Same process, any topic
New topic = new story + storyboard + (if needed) new scenes/characters. The engine, voice, camera, transitions, lint, mix and checks never change. Worked example: `$RC/examples/brandwake-promise/script.md` (a 35 s lesson on brands) shows 11 scenes, 13 cameras and every directive in use.

## Limits (say them, do not hide them)
Hand-drawn 2.5D, not 3D or photoreal. Voice is offline English (Kokoro). Built-in scenes are bakery/street/shop themed (shopfront, bench, desk, clock, calendar, queue, promise, talk, finale, bakery, street) and cast Rosa/Dario/neighbours/crowd: other topics reuse the generic ones (calendar, clock, desk, queue, promise, talk, finale, street) and add 2-4 new scenes. Not verified on a real phone, on real GPUs/macOS, or by uploading to YouTube. Characters idle, turn, blink, talk and walk in, but do not walk across the frame.
