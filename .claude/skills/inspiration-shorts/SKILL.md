---
name: inspiration-shorts
description: Make high-quality vertical YouTube Shorts (30-58 s, 1080x1920) from an idea, a story, a parable, or a public GitHub repository, entirely in code - animated money/lesson counters, chips, stamps, a transition library (wipes, iris, push, shutters, zoom, impact cut), word-synced captions, ElevenLabs narration, procedural sound design and an automatic layout QA gate, with the Lemo-Opuscar film-style library for other looks. Use this whenever the user wants a Short, an inspirational / motivational / moral-story / money-lesson / "how X went from A to B" video, a faceless story or explainer, a repo-story or "GitHub repo explained" video, or mentions inspiration shorts, Pride Parables, Brandwake, Lemo-Opuscar, or wants videos "like this reference" instead of generic AI slideshow clips - even if they never say "skill".
---

# inspiration-shorts

Turns a story into a finished vertical Short with code: no video model, no stock footage. The result must look designed, not generated: one visual system (type, chips, outlines, palette), one number that keeps moving, one visual action per beat, a transition that means something, and sound on every action.

The look is **inspired by** a reference format the user supplied (counter + chips + lesson banners + captions), never a copy. Do not reuse the reference creator's characters, wording, channel name or palette. Characters, props and palettes here are original, and each channel gets its own kit (`kits/`).

## Workflow (in order; do not skip the treatment: most bad Shorts fail in the story)

1. **Brief (ask once, only what you cannot decide).** Topic or source, channel kit, length (default 45-55 s), voice. Real people, brands or repos mean facts must be sourced. If a channel's niche is unknown, say so and use the placeholder kit.
2. **Pick the look.** Default is this skill's engine (counter/lesson format). Use the Lemo-Opuscar library when the story fits another medium better: see "Lemo-Opuscar" below and `references/lemo-opuscar.md`. Decide now, because it changes the build path.
3. **Story.** Read `references/story-craft.md`. Write the beat sheet *before* any script: hook, 4-5 beats, each with (a) a new number or fact, (b) a visual action, (c) a spoken line, (d) the transition into it. Real repo/company/person: collect numbers from a public source into `FACTS.md` (claim + URL). Fictional stories get labelled fictional.
4. **Script.** `script.txt`, one short sentence per fact, numbers spelled as words (the screen carries digits). 110-150 words for 50 s.
5. **Voice.** `python3 scripts/tts.py <project>` -> `vo.mp3` + `words.json` (word timings, pauses tightened). Voice comes from the kit. Re-run if a line sounds wrong.
6. **Spec.** Write `spec.json` (acts, items, counters, transitions); format in `references/spec-format.md`. Time everything to words (`"eighty#2"`, `"stops+0.2"`), never hand-typed seconds, so a re-recorded voice cannot desync the picture. Start from `examples/ego-trap/` (two-sided tug counter) or `examples/lemonade/` (single counter, hero + stand).
7. **Build.** `sh scripts/build.sh <project>`: layout QA first (fails on off-frame text, text over text, text over props), then sound design, frames, mux, loudness and black-frame checks. Fix every QA error; read the warnings.
8. **Review.** Contact stills (`node scripts/render.mjs <project> stills 1,5,9`) at phone size, including frames *inside* each transition; check `references/quality-bar.md`. One fix round, then deliver.
9. **Deliver**: `out/short.mp4`, `out/poster.jpg`, `FACTS.md` if any, and upload metadata (hook-first title under 60 chars, 2-line description, 3 hashtags, pinned-comment question). Remind the user to answer YouTube's AI-narration / synthetic-content question truthfully. Never upload or publish without an explicit go-ahead.

## Transitions: use them, and make each one mean something

Set `"transition"` on an act (or a default in the kit). Match meaning, not variety: `wipe-up` = level up / progress; `wipe-left` = time passing (year to year); `iris` = focus or reveal on a subject (`x`,`y` = where it opens); `diagonal` = rival / contrast; `shutters` = tension, a closing door; `push` = next chapter; `zoom` = scale change, "later"; `cut` = impact, the reversal (adds shake + flash). Use at most 3-4 different types per video, and use `cut` once, on the turn. Details and timings: `references/transitions.md`. Transitions are sound-designed automatically (whoosh / thud).

## Lemo-Opuscar (optional, use where it earns its place)

Public library of 99 code-made film styles plus a director's method: https://github.com/lemomo-ai/lemo-opuscar. Helper: `sh scripts/lemo.sh find <word> | style <slug> | guides | deps`.
- **Use the engine** for money lessons, tug-of-war comparisons, repo stats, business parables.
- **Use a Lemo style** when the story's medium matters: ancient kings and legends (`ink-wash`, `shadow-puppet`, `woodcut`, `gilded-illumination`, `stained-glass`), explainers (`stick-explainer`, `whiteboard`, `pictogram-motion`, `midcentury-toon`), data (`dataviz`, `spreadsheet`), code/product (`living-screencast`, `hologram-hud`).
- **Always borrow its method**, even on the engine path: treatment before drawing, cue map, sound design with real silences, contact-sheet review (`lemo.sh guides`).
- On a Lemo style: read its `STYLE.md` and `DIRECTOR.md`, render 1080x1920 (`--size 1080x1920`), keep this skill's story rules, `tts.py` narration and quality bar. Its demos teach grammar only: never copy their characters, shots, music, or anything marked Clawd or third-party marks. Films you make are yours; list third-party assets in `CREDITS`.

## Setup (once per machine)

Node 20+, ffmpeg, Python 3 + numpy, Playwright with Chromium (preinstalled in Claude Code cloud sessions: never run `playwright install`; scripts find Playwright through `NODE_PATH` or the global npm root). ElevenLabs narration works where the connection is configured. Lemo-Opuscar's own tools want ffmpeg 7+ (6.x makes its loudness check reject files).

## Channel kits

`kits/<channel>.json`: ink colour, gold gradient, caption colours, background presets, default transition, voice id. Reference with `"kitFile": "../../kits/pride-parables.json"`. New channel = copy a kit, change palette and voice; keep ink + gold + one accent per act. `kits/brandwake.json` is a placeholder until the niche is confirmed.

## Hard rules

- Hook inside 3 s; something new on screen every 1-2 s; never more than ~2.4 s with only the caption showing.
- One accent colour per act; text never on a same-colour background; all text inside the safe area (QA enforces).
- Spoken and on-screen numbers are real and consistent; do the arithmetic before building.
- Never copy another creator's characters, chip wording, handle or palette; no real brands or people in fictional stories without the right to.
- Never call a fictional story true; never publish without the user's go-ahead.
