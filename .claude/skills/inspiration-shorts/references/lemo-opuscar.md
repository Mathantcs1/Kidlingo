# Optional: Lemo-Opuscar (public library of code-made film styles)

Repo: https://github.com/lemomo-ai/lemo-opuscar (99 styles, a director's guide, build guide, render/TTS/audio tools). Code is MIT. The guides (`DIRECTOR.md`, `TECHNIQUE.md`, each `STYLE.md`) are CC BY-NC 4.0 with an extra permission to follow them for your own films, commercial included; do not copy them into a product or redistribute them. Films you make with it are yours, commercial use included. Third-party fonts, samples and music keep their own licences (list them in `CREDITS`).

## When to use it
This skill's engine covers the counter/lesson format. Reach for Lemo-Opuscar when the story needs a different medium: watercolor, newsreel, shadow puppets, stick-figure explainers, pictograms, data-viz, whiteboard, hologram HUD, and so on (`styles/README.md` indexes them). Closest to this format: `stick-explainer`, `pictogram-motion`, `dataviz`, `midcentury-toon`, `whiteboard`.

## Story type -> style (starting points; read the STYLE.md before committing)
| Story | Try |
|---|---|
| money lesson, comparison, repo stats | this skill's engine |
| king, war, legend, ancient moral | `ink-wash`, `shadow-puppet`, `woodcut`, `gilded-illumination`, `stained-glass` |
| how-it-works explainer | `stick-explainer`, `whiteboard`, `pictogram-motion`, `midcentury-toon` |
| numbers over time | `dataviz`, `spreadsheet` |
| software / repo / product | `living-screencast`, `hologram-hud` |

`sh scripts/lemo.sh find <word>` searches all 99.

## How
```
sh scripts/lemo.sh path     # clones to ~/lemo-opuscar if missing
sh scripts/lemo.sh deps     # ~350 MB; only when a Lemo style is chosen
```
Read `DIRECTOR.md` (treatment first, sound design, camera, review loop) and the chosen `styles/<slug>/STYLE.md`. It renders 1920x1080 by default; pass `--size 1080x1920` for Shorts. It is tuned for Claude at high effort and wants ffmpeg 7+ (6.x makes its loudness check reject the file); try a static ffmpeg 7 build if `mux.sh` fails.

Keep this skill's steps 1-3 (brief, story, script), `tts.py` for ElevenLabs narration and the quality bar even when the picture comes from Lemo-Opuscar. Its demos are references for grammar only: never copy their characters, shots or music, and never use anything under its `LicenseRef-Clawd` / third-party-marks exclusions.
