# ClipForge roadmap: Plans 4–13 (the full control list)

Status of this file: a ROADMAP, not an implementation plan. Each row below becomes a detailed plan (written with `superpowers:writing-plans`, approved by the user, executed with `superpowers:subagent-driven-development`) when its turn comes. Source: the user's list of nine control categories (canvas, timeline, animation, text/captions, audio, effects/compositing, components/templates, differentiators, export/reliability). Written 2026-11-11 at Plan 3 deployed (data v3); Plan 4 plan is `2026-11-11-clipforge-plan-4-visual-effects.md` (data v4/v5).

Legend: ✅ shipped · 📋 in a written plan · ⬜ planned here · ❓ needs a product decision first.

## Sequencing and why

| Plan | Theme | Data | Depends on |
|---|---|---|---|
| 4 | Visual effects and looks (+ blend modes, adjustment layers, overlays) | v4, v5 | Plan 3 |
| 5 | Keyframes and the animation system | v6 | 4 (effect params are keyframable) |
| 6 | Text and captions | v7 | 5 (text animation), 4 (overlay rendering) |
| 7 | Timeline precision (speed, transitions, markers, linking, history…) | v8 | 5 for transitions' easing |
| 8 | Canvas and compositing tools (select, anchor, crop, align, groups, masks, navigation, command search) | v9 | 4, 5 |
| 9 | Audio pro (meters, loudness, de-esser, volume automation, sync, beats, sound library) | v10 | 5 (automation), 7 (markers) |
| 10 | Advanced visual (curves/wheels/scopes, tracking, stabilisation, particles, background removal) | v11 | 5, 8 |
| 11 | Components and templates | v12 | 8 (groups/nesting), 7 (nested sequences), 6 |
| 12 | Export and reliability | v13 | 7 (ranges), 11 (package) |
| 13 | Differentiators (scope, protected edits, variants, transcript editing, AI) | v14 | 6, 7, 11, 12 + decision D-AI |

Each plan keeps the rules that work: split big files first, one data bump per plan with a migration step, one shared engine for preview and export, TDD with real pixel/audio measurements, a deploy gate between parts, final whole-branch review. Version numbers are indicative: only breaking data changes bump.

## Open product decisions (needed before the plans they block)

- **D-AI: DECIDED 2026-11-11 by the user: BOTH.** Local on-device models are the default (nothing leaves the browser); an opt-in cloud AI path is added with explicit per-action consent, a cost preview before any external charge, and a visible "this leaves your device" notice; every AI operation must emit the same reversible edit functions as the manual UI. The README privacy statement must be updated when the first cloud feature ships. Original options for the record:
- **D-AI (blocks Plan 13 and parts of 6/10).** ClipForge has no backend and the README says nothing leaves the browser. Natural-language commands, selective regeneration, cost preview and any hosted model contradict that. Options: (a) stay local-only: on-device models (WASM Whisper for transcripts/auto-captions, on-device segmentation for background removal, DSP beat detection) with download size and speed costs; (b) add an opt-in cloud AI path with explicit per-action consent, cost preview and a visible "this leaves your device" notice; (c) both. Natural-language editing must only emit the same reversible edit functions as the manual UI (user requirement: inspectable and revisable).
- **D-sound-library.** "Usage-rights metadata" needs a content source: user-imported files with metadata only (local), or a licensed catalogue (external). Default: local library only.
- **D-nested.** Groups (Plan 8), nested sequences (Plan 7/11) and parenting share one hierarchy model; decide once, in Plan 8, whether a group is a clip-container or a track-container.
- **D-fonts.** Text (Plan 6) needs web-font loading and fallback for RTL/Unicode; decide bundled fonts vs user-imported fonts (licensing).

## 1. Selection and canvas controls → Plan 8 (basic transform already ✅)

| Control | Required capabilities | Status | Plan |
|---|---|---|---|
| Select tool | single/multiple selection, selection box, select through overlapping layers | ✅ clip selection, on-canvas handle for the selected clip; ⬜ marquee, pick-through | 8 |
| Transform panel | position, width, height, rotation, opacity, aspect-ratio lock | ✅ x/y/scale/rotation/opacity; ⬜ width/height + lock | 8 |
| Anchor-point control | pivot for rotation and scaling | ⬜ (data: `transform.anchor`) | 5/8 |
| Crop and framing | crop, fit, fill, reposition media inside a frame | ✅ fit/fill/blur; ⬜ crop and in-frame reposition | 8 |
| Alignment controls | align, distribute, snap, guides, margins | ✅ snap to centre/edges; ⬜ align/distribute/guides/margins | 8 |
| Layers panel | reorder, rename, group, lock, hide, nested groups | ✅ reorder/rename/lock/hide; ⬜ groups, nesting | 8 |
| Parenting control | attach one object to another, keep relative position | ⬜ | 8 (needs hierarchy, D-nested) |
| Mask editor | rectangle, ellipse, custom path, feathering, inversion | ⬜ | 8 |
| Canvas navigation | zoom, pan, fit view, full-screen preview | ⬜ | 8 |
| Safe-area overlays | custom guides for titles, captions, platform UI | ⬜ | 8 |
| Inspector | editable properties for the selected object | ✅ | grows each plan |
| Command search | find and run any editor action | ⬜ (needs an action registry: do it early in Plan 8) | 8 |

## 2. Timeline and precision editing → Plan 7

| Control | Required capabilities | Status | Plan |
|---|---|---|---|
| Track controls | add, rename, reorder, lock, hide, mute, solo | ✅ | — |
| Clip operations | split, trim, duplicate, replace, disable | ✅ split/trim/delete; ⬜ duplicate, replace-keeping-settings, disable | 7 |
| Ripple editing | close gaps or shift following clips | ✅ ripple delete; ⬜ ripple trim/insert, gap close | 7 |
| Roll, slip, slide | adjust cuts and contents precisely | ⬜ | 7 |
| Link/unlink clips | keep video, audio, overlays together | ⬜ (Plan 3 detach is unlinked by decision D2) | 7 |
| Markers and ranges | named markers, comments, export ranges | ⬜ | 7 (ranges feed 12) |
| Frame navigation | step frames, jump to cuts, exact timecode | ⬜ (also a known gap: keyboard playhead control) | 7 |
| Playback controls | loop selection, speed, preview quality | ⬜ | 7 |
| Speed editor | constant, ramps, freeze, reverse | ⬜ (touches every `out − in` site) | 7 |
| Nested sequences | edit a group of clips as a reusable sequence | ⬜ | 7/11 |
| History panel | named checkpoints, undo/redo, restore versions | ✅ undo/redo; ⬜ panel, checkpoints, version restore | 7/12 |
| Timing locks | protect selected clips or sections | ⬜ | 7 |
| Transitions | (Plan 5 roadmap) fade, crossfade, wipe, slide, zoom, glitch | ⬜ needs a clip-overlap model | 7 |

## 3. Animation controls → Plan 5 (one reusable system before presets)

| Control | Status | Plan |
|---|---|---|
| Keyframe editor (add, move, copy, paste, delete) | ⬜ | 5 |
| Curve editor (Bézier, easing presets, overshoot, hold) | ⬜ | 5 |
| Motion-path editor (draw/modify, orient along path) | ⬜ | 5 |
| Animation stack (entrance, emphasis, continuous, exit) | ⬜ | 5 |
| Preset browser (animated previews, search, categories, favourites) | ⬜ | 5 |
| Preset parameters (duration, delay, direction, distance, intensity) | ⬜ | 5 |
| Stagger control (words, letters, objects) | ⬜ (words/letters need Plan 6) | 6 |
| Loop control (repeat, ping-pong, count, seamless) | ⬜ | 5 |
| Spring controls (stiffness, damping, bounce) | ⬜ | 5 |
| Animation transfer (copy and adapt to dimensions) | ⬜ | 5 |
| Animation blending (how overlapping animations combine) | ⬜ | 5 |
| Save-as-preset | ⬜ | 5 |
| Initial presets: fades, slides, zooms, pops, bounces, pulses, rotations, wipes, typewriter text, drawn paths | ⬜ typewriter needs 6; drawn paths needs masks/paths from 8 | 5/6 |

## 4. Text and caption controls → Plan 6

Typography panel, text appearance (fill/gradient/stroke/shadow/background), responsive text boxes with wrapping and overflow detection, caption editor (transcript and timeline views linked), word timing, caption styling and saved presets, placement that avoids important objects (needs subject info: 13) with manual override, Unicode/RTL/font fallback (D-fonts), SRT/VTT import/export, text animation by character/word/line/paragraph (uses Plan 5). Auto-captions need ASR (D-AI). All ⬜.

## 5. Audio controls → Plan 9 (a lot already ✅ from Plan 3)

| Control | Status | Plan |
|---|---|---|
| Waveform editor | ✅ waveforms, trim/split, fades; ⬜ finer alignment tools | 9 |
| Mixer | ✅ track volume/pan/mute/solo; ⬜ meters | 9 |
| Volume automation | ⬜ keyframes and curves | 9 (needs 5) |
| Automatic ducking | ✅ (by clip coverage) | — |
| Voice cleanup | ✅ noise reduction, EQ, compressor; ⬜ de-essing | 9 |
| Loudness controls | ✅ peak Normalise; ⬜ LUFS measure/normalise, clipping detection | 9 |
| Recording panel | ✅ record/play-along; ⬜ mic selection, input meter, countdown, retakes | 9 |
| Audio synchronization | ⬜ align external audio with video | 9 |
| Beat markers | ⬜ detect, snap edits | 9 (needs 7 markers) |
| Sound library | ⬜ search, preview, favourites, rights metadata | 9 (D-sound-library) |

## 6. Effects and compositing controls → Plan 4 (+10)

| Control | Status | Plan |
|---|---|---|
| Effects stack (add, reorder, disable, copy, reset) | 📋 add/reorder/disable/remove; ⬜ copy/paste stack, reset | 4 / 8 |
| Colour correction | 📋 exposure, contrast, saturation, temperature/tint | 4 |
| Advanced colour (curves, colour wheels, LUTs, scopes) | 📋 LUTs; ⬜ curves, wheels, scopes | 4 / 10 |
| Blur and sharpening (adjustable, selective) | 📋 adjustable; ⬜ selective (needs masks) | 4 / 8 |
| Blend modes | 📋 added to Plan 4 (Task 11a) | 4 |
| Chroma key | 📋 colour, tolerance, smoothness, spill; ⬜ edge cleanup refinements | 4 |
| Background removal | ⬜ (ML: D-AI) | 10 |
| Tracking | ⬜ position/scale/rotation tracking, attach overlays | 10 |
| Stabilisation | ⬜ strength and crop | 10 |
| Particle editor | ⬜ emitter, count, speed, direction, lifetime, seed | 10 |
| Transition editor | ⬜ | 7 |
| Adjustment layers | 📋 added to Plan 4 (Task 13a, data v5) | 4 |

## 7. Reusable components and templates → Plan 11

Component creator, exposed properties, media slots, text slots (length/overflow rules), responsive layouts (aspect-ratio variants), template builder, brand styles (colours, fonts, logos, caption styles), batch replacement, component versions with preview-before-apply, library manager (search, tags, previews, favourites, import/export). First generic templates: talking-head, tutorial, product demo, interview, slideshow, advertisement, explainer, quiz, social clip. Needs groups/nested sequences (8/7), text (6) and the package format (12). All ⬜.

## 8. Differentiators → Plan 13 (after the base is stable)

Edit scope selector, protected-edit mode, timing dependency editor (attach animation to words/markers/beats), replace-and-preserve, transcript editing (ASR: D-AI), natural-language commands (D-AI; must call the same edit functions as the manual UI and be reviewable/reversible), before/after comparison, variant manager, smart reframing (tracking + keyframes), layout conflict detector, selective regeneration (D-AI), cost preview (D-AI), batch production from template + data. Several (scope selector, protected edits, before/after, variants, conflict detector) are pure editing-model features that need no AI and can ship first.

## 9. Export, performance and reliability → Plan 12

| Control | Status | Plan |
|---|---|---|
| Export panel (resolution, fps, format, codec, quality, audio) | ✅ 1080p/4K MP4 H.264/AAC only; ⬜ the rest | 12 |
| Render queue (progress, cancel, retry, history) | ✅ progress/cancel for one job; ⬜ queue/history | 12 |
| Range export | ⬜ (markers/ranges from 7) | 12 |
| Batch export | ⬜ | 12 / 13 |
| Pre-export checks | ⬜ missing media/fonts, text overflow, silent sections, clipping | 12 |
| Proxy manager | ⬜ | 12 |
| Cache manager | ⬜ storage usage, safe cleanup | 12 |
| Project recovery | ✅ autosave and session restore; ⬜ interrupted-session recovery UI, version restore | 12 |
| Portable project package | ⬜ project JSON + required assets | 12 |
| Diagnostics | ✅ WebGL/export failure reasons; ⬜ name the failing asset/effect | 12 (starts in 4: shader policy) |

## How to use this roadmap

1. Before writing a plan, re-read its section and the "depends on" column; settle any ❓ decision first.
2. A control moves from ⬜ to 📋 only when a written, approved plan task owns it, and to ✅ only when deployed and its manual QA checklist item is done.
3. If a control proves to need a model outside its plan (hierarchy, action registry, ASR), build that foundation as the plan's first task rather than patching around it.
