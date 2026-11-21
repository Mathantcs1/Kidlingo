# Stickman studio lessons (hard-won, 15 Nov 2026)

- UI helpers (dataCard, titleCard, badge, callout, endScreen, blueprint, bigLine) print placeholder text or draw rising graphs for falling numbers. Draw directly with canvas.
- Graph/counter direction must match the narration; verify stills.
- Guard NaN: `const dur = info.dur || fallback; p = clamp(t/dur)`.
- Rendering: 4 cores. One render at a time. Run `node render.mjs --project X --workers N > log 2>&1` (no `&`, no pipe). Clear `build/parts/*.mp4 build/video_silent.mp4 out/*.mp4` before re-rendering. Concurrent renders/mixes corrupt output files (a corrupt V2 was delivered once).
- Mix: music moods valid: mystery, tension, action, wonder, hopeful, sad, triumph, playful, calm, dark, epic. sfx entries in shots.json are objects {name, at, gain}.
- Verify final file: `ffmpeg -v error -i f -f null -`, ffprobe durations, volumedetect at several timestamps.
- Renders are slow (~1 fps at 4 workers): plan hours for 16:9 long-form.
- Kill duplicate render processes with `kill -9` and `pkill -f <project>`.
- A partial render (`--from/--to/--out`) still writes its pieces into `build/parts/` and overwrites the previous full-render parts (and `build/video_silent.mp4` if you concat there). Copy `parts/` aside first, or rebuild from the exported MP4 (`trim=end_frame` + concat filter).
