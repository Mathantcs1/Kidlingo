# Review panel (run on every finished Short BEFORE it reaches the owner)

Owner rule (21 Nov 2026): reviewers with different mindsets inspect each video and the builder fixes issues first. Reviewers are FRESH agents (not forks) that have not seen the build history; each reads only the mp4 sheets/frames, the script, sources.md, beats and the QC output, and writes `projects/<slug>/review/<persona>.md`: score 0-10, a list of issues (severity BLOCKER / MAJOR / MINOR, timestamp, what is wrong, exact fix), and what is strong. They never edit the project files.

## Personas (each judges the same video from a different seat)
1. **Swipe-away viewer (retention analyst)**: would I swipe in the first 2 s? Hook strength, open loop, re-hook every 10-15 s, dead air, pacing, ending/loop, comment question. Reads a 3 fps sheet of the first 5 s plus 1 fps of the rest.
2. **Fact editor (hostile fact-checker)**: every on-screen and spoken number/label vs sources.md (2 sources each), units, years, direction of counters, "company-reported" labels, causal claims not in sources, tone/defamation, named individuals, logos, disclosures (AI narration, fiction label).
3. **Art director (shark-quality bar)**: compare with the reference playbook (HUD, hero close-up then pull-back, props popping, cinematic backdrops, caption pill with one gold word, camera move every ~1.5 s). Empty areas, clipped or overlapping text, inconsistent style, flat shapes, safe zones for the Shorts UI (bottom 15%, right 12%), legibility on a phone.
4. **Sound designer (measurable audio)**: loudness (-14 LUFS target), ducking under voice, clipping, silent gaps, sfx density/timing vs on-screen actions, music mood vs story, music identity differs from other videos; list measured numbers (cannot listen: say so).
5. **Naive viewer (teen, no domain knowledge)**: do I understand the story without prior knowledge, is any jargon unexplained, is the lesson clear and useful, would I share/comment, does it feel like a lecture anywhere.
6. **Brand/series editor**: consistent with the channel look and tone, different enough from the other videos (voice, music, colours, structure) to avoid repetitive-content risk, title/description honest.

## Loop
Round 1: all personas review in parallel -> collect -> builder fixes every BLOCKER and MAJOR (and cheap MINORs) -> ONE re-render under flock -> round 2: the same personas re-check only their own findings. Ship to the owner only if no BLOCKER, no MAJOR, and every persona scores >= 8. If still failing after round 2, tell the owner what is left, honestly. Token rules apply: small sheets, no polling, no node_modules/build reads.
