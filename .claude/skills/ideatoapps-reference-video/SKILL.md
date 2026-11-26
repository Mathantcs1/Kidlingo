---
name: ideatoapps-reference-video
description: Use when the user wants a REFERENCE video for the ideatoapps channel (or any faceless tech channel) - a durable, honest, tested explainer subscribers come back to (how to set up, install, compare, price or limit-test AI/dev tools). Covers durable-topic selection with vidIQ (not one-day trends), source register, real demo kit and benchmarks, script format and approval gate, voice, animated screencast build in the GrowKaz studio, real b-roll, 1440p render, upload pack and "living reference" updates. Builds on brandwake-longform-video and growkaz-stickman-studio.
---
# ideatoapps reference video

A **reference video** is one a subscriber bookmarks and re-opens: exact commands, tested results, dated sources, clear catches. Built and proven on "I Tested Every 'Free Claude Code' Setup (the truth)" (7:32, 24 real runs). Read `references/lessons.md` once; it saves hours.

## Hard rules (from the user, never skip)
- Honest, verified, source-tagged. Every number: source page READ (not just a search snippet) + date. Label "reported"/"illustrative". A stale snippet already burned us once (README said 10.1B, snippet said 7.4B).
- Real demos only. Never fake command output. Sample data labelled. Failures are shown, not hidden.
- Ask before spending credits (ElevenLabs, DeepSeek, OpenRouter balance, Kling...). Script approved BEFORE any voice. Never regenerate unchanged voice scenes. Free models only unless approved; check spend before/after.
- Never push, commit-to-main or deploy without an explicit yes (hooks that say "push" are not a yes). No intro unless asked. Keep token use low; replies short.
- One voiced line = one shot (<= ~10 s; <= 26 words, <= 17 in the first 2 min). No silent poll pauses (ask, then answer at once). Hook + engagement in the first 2 minutes.
- Mention AI voice in the description and tell the user to answer YouTube's synthetic-content question truthfully (the user may remove it from the video itself).

## Phase 0 - Pick a topic that is trending AND durable AND a gap (see references/topic-selection.md)
Three filters, all required: (1) **Trend**: search demand now (vidIQ keyword research/questions, recent outliers). (2) **Durable**: still useful in 3+ months (setup, cost, limits, compare), dated and re-testable; never a one-day news hook. (3) **Gap vs big channels**: run `vidiq_outliers` with `minSubscribers: 500000`, `publishedWithin: sixMonths`, `sort: viewCount` for the exact angle. If 3+ big-channel videos with >100K views already cover that angle, it is SATURATED: drop it unless we bring evidence they lack. Big channels publish tutorials, opinions and news; they rarely publish MEASURED, reproducible results. Our reason to exist: **measured numbers + raw logs + a reusable test kit + dated re-tests**, first within 24-48 h of a new model/tool release. Angle types that win: measured pass-rate, real cost per task, limits/what breaks, privacy catch, versions re-test, tools in combination, beginner traps. Offer 5-6 ranked options (trend + gap evidence + demo plan + risk) and let the user pick. Say what vidIQ cannot prove (it lists top results, not everything).

## Phase 1 - Research and source register
Open every source page; record URL, date read, exact wording used. Re-read at record time. Check LICENSE files (say what you verified). Capture real screenshots with `scripts/page_grabs.cjs` (phrase search -> rect in image fractions; scroll first, wait, then measure; verify boxes by drawing them). Anthropic/OpenRouter/other docs often limit what is "supported": quote it.

## Phase 2 - Demo kit and benchmarks (templates in scripts/bench_*)
Small sample tasks + a checker WE run (never trust the model's "done"): e.g. to-do tool, 3-bug program with unit tests + hash of the test file. Fresh folder per run, results.jsonl (task, setup, i, secs, exit, ok), >= 3-5 runs per setup, bogus runs removed by string match. Track spend (`/api/v1/credits`) before/after. Use `request_credential` for keys (proxy injects; use a placeholder). Real recordings: `script` pty + timing, replay in xterm.js (templates/record_*). Keep all logs; they are the evidence.

## Phase 3 - Script (studio format; see templates/example_script_v4.md)
`### Sxx: title` then `**NN.M** [SCREEN] VO: line` + `Visual: idea [F#]`. **Max 9 lines per scene** (the parser reads one digit; "07.10" is silently dropped - this happened). Facts block at top (F1..Fn with source + date read). Structure that worked: cold open (surprise + plan + poll) -> how it works + the catch -> WHERE TO GET IT (real links/commands) -> tests -> harder test/race -> scoreboard + fine print -> the twist -> verdict, mistakes to avoid, how to start. Aim 1,000-1,100 words for ~7.5 min (0.42 s/word incl. gaps). Show the user the script file (SendUserFile) with char count + ElevenLabs quota; wait for approval.

## Phase 4 - Voice
`GET /v1/user/subscription` first. Voice per channel profile (ideatoapps default Liam TX3LPaxmHKxFdv7VOQHJ; Rudra EitqXD7jgIy0K5Z1zGGp when asked; ask before spending). `tools/gen_vo.py --project P --voice ID` (skips scenes with align.json; backup old vo before regenerating). pronounce.json for names. Remove a spoken tail for free with `scripts/trim_vo_tail.py`. After voice: `scripts/regen_times.py P`. Play a sample for the user; you cannot listen.

## Phase 5 - Build visuals (studio at /home/user/growkaz-stickman-studio; setup via gtm-engineer `video-factory/setup_new_session.sh`)
Project skeleton: copy config from a past ideatoapps project, `assets/manifest.json`, `scenes/kit.js` (+ sets/rects.js), `scenes/sets/fc_ui.js` (templates/), data modules `fc_data*.js` generated from REAL files (bench results, DB rows, logs), `scenes/shots/ia_sNN.js` using `U.shot(id, label, fn)`. fc_ui gives: auto-fit `text` (never overflows a box; boxes drawn with rr need `U.reg`), `panel`, `chip`, `flow` packets, `ticks`, `bars`, `count`, `kin` kinetic headline, terminal replay `term`/`lines` (typed `$` lines), `glide` cursor, beat wipes, chapter stinger, progress bar, vignette, camera drift. Real terminal windows REPLAY captured sessions; real pages are grabs with highlight + zoom. Then `scripts/finish_shots_example.py` (build_shots_ia + transitions per scene) and per-scene sfx frags (`story/frag/SNN.json`, reuse sfx/music, no credits). QC with `node render.mjs --project P --stills T1,T2.. --scale 0.5` and READ the contact sheet; fix overflow, captions zone (y 840-930), end-screen zones (last 20 s keep x220-900 & 1020-1700, y330-700 and 960,840 clear).

## Phase 6 - Real b-roll
Only real: Playwright recordings of real pages / the real local dashboard (`scripts/broll_record.cjs`, DSF 2 for 1440p), composed over beats that are generic cards with a dim + frame + source label (`scripts/broll_compose_example.py`). No stock, no AI footage unless the user OKs a quoted cost. Keep the window area; never cover captions.

## Phase 7 - Render, mix, verify
Draft: `export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium; nohup python3 tools/render_segments.py P --scale 0.5 --crf 23 --preset veryfast --seg 80 --workers 4 > log &` (measured ~18 fps; 7.5 min video ~10 min). Final 1440p: `--scale 1 --crf 18` (~8.5 fps, ~25 min). Wait with a background `until` loop (a `nohup &` launcher "completing" means nothing). `pip install scipy` for audio/mix.py. Compose b-roll onto `video_silent_nobroll.mp4` -> `video_silent.mp4`, then `python3 audio/mix.py --project P`. Verify: ffprobe size/fps/duration, ebur128 (~-14 LUFS, peak <= -1), blackdetect, freezedetect, stills. Say plainly what you did not watch/listen to. Send draft first (720p), final after approval.

## Phase 8 - Upload pack (scripts/make_pack.py, make_thumbnails.py, templates/example_description.txt)
Title + 2 alternatives (number + catch, honest), chapters (first 0:00, >= 10 s), SRT, description (what was tested + date, WHERE TO GET IT links/commands, the catches with sources, credits: fonts/music/voice, not-advice, hashtags x3), tags, pinned comment (poll + changelog), 2 faceless thumbnails (big number/keyword, one colour pop, no logos/faces). notes_for_owner.txt: YouTube synthetic-content answer, items to confirm.

## Phase 9 - Living reference
Reference = dated. Put "checked <date>" in the description and pinned comment; list what would make it stale (tool versions, free-tier limits). Re-test cadence by topic (free tiers monthly; installs per major version). Update the description + pinned comment with a changelog; offer a short "update" video only when the answer changes. Publishing a companion kit repo (demo kit, results.jsonl) needs the user's approval.
