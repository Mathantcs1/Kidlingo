# Open-source assets used in videos

Rule: permissive licences only (MIT / Apache-2.0 / CC0), licence checked in the installed package. Installed with `npm install --save-exact` inside `growkaz-stickman-studio/` (served by the renderer at `/node_modules/...`; `node_modules/` is gitignored, so run `npm install` on a fresh machine).

| Library | Version | Licence | Used where | How |
|---------|---------|---------|-----------|-----|
| roughjs | 4.6.6 | MIT | long1-champion: hand-drawn circles, underlines, crosses, rectangles on charts, notebook, note (`scenes/_ossfx.js` `roughDraw`) | `rough.generator()` + `toPaths` drawn via `Path2D`; seeded, so every frame is deterministic |
| matter-js | 0.20.0 | MIT | long1-champion: confetti (s006, s082, s083) and mud splash (s056) (`physics`, `drawPhysics`) | UMD build loaded with a one-time indirect `eval` (module scenes cannot import UMD); bodies are simulated at 60 Hz once per key and sampled at the video fps, so a frame is a pure function of time (safe across render workers; the spawn function must be identical wherever a key is reused) |

Tested before use: one still each (hand-drawn ellipse/line, falling confetti settling on the floor) rendered correctly in the `retro` style.

Considered and skipped: PixiJS and tsparticles (WebGL/extra weight on a software-GL render, no clear gain), lottie-web (needs commercially licensed Lottie files; none vetted).
