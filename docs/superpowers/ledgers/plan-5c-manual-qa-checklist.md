# Plan 5C manual QA (transitions)

Run on a real Mac (Chrome and Safari) after the headless checks; none of this is verified on real hardware.

## Picture (real GPU)
- Each type at 0.5 s and 2 s on two clips with unused footage: dip, dissolve, wipe (all four directions, softness 0 and 50 %), slide, push, zoom (1.2x and 4x), glitch. Smooth at 30 fps in the preview; no flicker at the first and last window frame.
- A transition with a Screen / Multiply blend on one clip; with an adjustment layer above (it sees the finished transition).
- A 4K project: a transition frame does not stall or crash (non-Normal blend scales down).
- Six decoders at once (three tracks, each with a transition): preview stays responsive, no black frames when scrubbing across the windows (long-GOP phone clips too).
- Dip on an upper track over a lower picture: the picture area goes black (not transparent).

## Sound
- Crossfade between two different shots: equal power sounds level; between two halves of the same shot the constant-gain law sounds seamless.
- Audio-only crossfade on two audio clips; a transition on a 50 % speed clip and a reversed clip.
- Listen across a live window cut inside a crossfade (long clips): no click.

## Editing
- Add via "+", T, tile click and tile drag; duration drag with the handle limit (toast / clamped chip); Delete with a transition selected; trim the cut edge (the toast, then undo); split, join (Merge with crossfade), copy / paste of two clips, speed change on a transitioned clip.
- Export 1080p: open in QuickTime; picture and sound at the cut match the preview.

## Data
- Open a v9 project: unchanged. Open a v10 project in an older open tab: "saved by a newer version", data untouched.
