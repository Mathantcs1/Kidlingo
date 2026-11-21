---
name: faceless-video-studio
description: Make original faceless animated YouTube videos (Shorts 9:16 and long-form 16:9) with a Stickman Studio render pipeline (HTML canvas + Playwright + ffmpeg). Use whenever the user wants to script, build, render, mix, check, or prepare upload text for a Short or long video, a music-first or narrated story, a split-screen counter Short, an intro, a thumbnail, or asks how our videos are made. Encodes the full process, hard-won rendering rules, ElevenLabs credit rules, quality checks and YouTube metadata.
---

# Faceless video studio (Shorts + long-form)

Process for making faceless videos. The render studio (`growkaz-stickman-studio/` folder) is NOT in this repo: ask the owner for the growkaz-stickman-studio folder, copy it in, run `python3 tools/doctor.py`, then follow this skill. The plugin skill `growkaz-stickman:make-2d-video` (if installed) has the engine API references.

Styles catalog (A-G, with built examples): `references/styles-catalog.md`. Titles, descriptions and upload steps: `references/titles-and-upload.md`.

Token efficiency (rules + measured data): `references/token-efficiency.md`; measure with `scripts/token_report.sh`.

Read first: `references/studio-lessons.md` (rules learned the hard way) and `references/shorts-playbook.md` (what works in Shorts, learned from references: learn the principles, never copy formats, titles, characters or ideas).

## STRICT POLICIES (mandatory for every video, any channel, any repository)
1. **Review panel before delivery**: no video reaches the owner until the six-persona review panel in `references/review-panel.md` has run, the builder has fixed every BLOCKER and MAJOR, and all scores are >= 8. Never skip it; if time or credit is short, say what is unreviewed instead of shipping.
2. **Every Short ends by educating the viewer**, directly ("Lesson: ...") or indirectly (a moral/payoff line), before the comment question.
3. **Hook first**: line 1 lands in 2 seconds (surprising number, contradiction or challenge); open loop early, re-hook every 10-15 s. Quality over count; length follows the story (up to ~1:30 if it earns it).
4. **Facts**: every number has 2+ sources actually read; no logos; fiction labelled; AI narration disclosed.
5. **Credit and tokens**: finalize the script before any ElevenLabs call, generate each narration once, follow the token rules.

## Decide first
1. Channel and look: ask the owner which channel and brand style. Fiction is labelled fiction; real stories are sourced.
2. Format: **Short** (9:16, 20-58s) or **long** (16:9, 3-8 min).
3. Style: **music-first** (default for Shorts: visuals + big on-screen text + sfx + music, no voiceover) or **narrated** (ElevenLabs). Test styles on DIFFERENT stories; never upload the same story in two versions.
4. Vary topic, characters, palette, structure and voice from video to video (repetitive content risks demonetization).

## Process
1. **Concept**: one-sentence premise with a contrast or a forbidden thing ("same start, different choice"). Real stories need sources (cite in description); fiction is labelled fiction. No real brand logos as art, no third-party IP.
2. **Script / beats**: 8-14 beats for a Short, one line each (each line = one on-screen text change or one narration chunk). Hook in the first second, payoff line last, ending loops to the first frame. Numbers and counters must move the direction the meaning says (falling = down). Read the script aloud once; cut anything that drags.
3. **Narration (only if narrated)**: finalize the script FIRST, then `python3 scripts/elevenlabs_tts.py --script script.txt --voice JBFqnCBsd6RMkjVDRZzb --out voiceover.mp3` (checks balance, refuses to overwrite). One generation per video; never regenerate for small edits. Keep the mp3 in the repo. Pace: Shorts ~175-190 wpm if natural, long-form ~150 wpm. Voices: George (storyteller) JBFqnCBsd6RMkjVDRZzb; list others via `GET /v1/voices`.
4. **Project**: `python3 tools/new_project.py --name <slug> --voice <mp3> --script <txt> --aspect 9:16|16:9 --resolution 1080p --title "<title>"`, then `python3 tools/transcribe.py --project projects/<slug> --script ... --lang en --model small` (needs numpy array path if faster-whisper/av break). Music-only: create a silent track of exact length, captions off.
5. **Build shots**: `scenes/cast.js`, `scenes/sets/*.js`, `scenes/shots/*.js`, `story/shots.json`. Rules: draw text/graphics directly on canvas with `V()` for aspect values; no UI.dataCard/titleCard/badge/callout/endScreen/blueprint/bigLine (they print placeholder text); no Math.random/Date.now; NaN guards (`info.dur` fallback); camera move or cut every 1-2.5s; distinct set/colour per beat; cold light = bad outcome, warm = good. Big centre/lower captions, one idea at a time; never type half-words on screen (pop whole lines/words).
6. **Check before rendering**: `node render.mjs --project projects/<slug> --sheet --scale 0.5`; READ every sheet PNG: text matches what is said, no overlap with characters, no placeholder text, directions correct, text fits its box.
7. **Render** (4 cores, ONE render at a time; when several are built at once wrap every render and mix in `flock /tmp/studio-render.lock ...`): `rm -f build/parts/*.mp4 build/video_silent.mp4 out/*.mp4` then `node render.mjs --project projects/<slug> --workers 4 > log 2>&1` in the background (no `&`, no pipe). Long videos: ~1 fps, so plan hours; segments via `--from/--to/--out`, validate each, concat with a list.txt. Never mix while a render runs.
8. **Mix**: `python3 audio/mix.py --project projects/<slug>` (-14 LUFS). Music moods only: mystery, tension, action, wonder, hopeful, sad, triumph, playful, calm, dark, epic. sfx in shots.json are objects `{name, at, gain}` with names that exist in `audio/`. Do not use copyrighted songs; use generated music, YouTube Audio Library or licensed tracks.
9. **Final QC**: `scripts/qc_video.sh <file>` (decode check, durations, audio level at several points, frame sheet), then read a 3 fps sheet of the whole video for glitches (flicker, clipped text, odd poses, loop mismatch). You cannot listen: say so.
10. **Review and select**: score each finished video with the scorecard in `references/styles-catalog.md`; fix the weakest points and re-render; upload only the best (1-2 per week), keep the others for later.
11. **Upload pack** (`references/titles-and-upload.md`): title (hook first, under ~60 chars), description (hook line, one-line story, question, 3 hashtags, "fictional" + "AI narration" disclosure), 8-12 tags, pinned-comment question, chapters for long videos, thumbnail 1280x720. Remind: answer YouTube's altered/synthetic content question truthfully; verify monetization rules in YouTube Studio.
12. **Deliver and save**: send files with the file tool, commit source (never mp4: `out/` and `build/` are gitignored), update memory notes.

## Shorts recipe (adapt, don't copy)
Hook text in the first second; one beat per 1-2s; big readable captions with one highlighted word; counters/day labels; sound effects timed to action; payoff line; clean loop. Music-first Shorts need no ElevenLabs credit.

## Honesty
Do not promise views or income. Say what you checked and what you could not (audio by ear, real-device playback). Credits: check `GET /v1/user/subscription` before any TTS; free sfx/music first.

## Environment notes
In cloud sessions install npm/python deps and ffmpeg first (the owner's studio repo has a SessionStart hook for this; not included here). `tools/doctor.py` may print 'Chromium MISSING' in cloud sessions; ignore it, rendering uses the preinstalled Chromium in /opt/pw-browsers (never run `playwright install`). MP4s are never committed (gitignored); download or upload them before the session ends (Drive uploads from a session are limited to 10 MB per file).

## Commands cheat sheet
`python3 tools/doctor.py` · `node render.mjs --project P --stills t1,t2 --scale 0.5` · `--sheet` · `--from A --to B --out F` · `python3 audio/mix.py --project P` · intro: `channel/intro/make_intro.py` (ffmpeg).
