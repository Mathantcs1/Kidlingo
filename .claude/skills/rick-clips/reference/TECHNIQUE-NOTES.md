# Reference analysis (technique only)

Source: five consecutive phone screen-recordings of one short-form reel, 8.5–9.0 s each (~44.7 s total), 1180×2556, 60 fps,
**no audio track captured**. Everything below is measured or read from frames locally. No frames, clips, names, characters or UI
from the reference are stored in this project (see "Do not copy").

## Measured numbers
| Item | Value | How |
|---|---|---|
| Shot cuts detected | 34 over 44.7 s ≈ **one cut per 1.3 s** (per clip: 11, 5, 13, 1, 4) | ffmpeg scene filter, threshold 0.18, picture area only. Under-counts dissolves, over-counts on phone notification banners, so treat as ±30 %. |
| Caption word hold | **3 frames at 6 fps ≈ 0.4–0.5 s per word**; punctuation words stay on screen with their word | dense strip of the caption band |
| Caption position | band at **60–69 % of frame height**, horizontally centred, one word (sometimes two) at a time | frame crop |
| Caption style | heavy bold sans, white fill, thick black outline plus soft drop shadow, ~6–7 % of frame height | frame crop |
| Audio | unknown (not captured) | — |

## Look
Flat 2D stick-figure characters (large round heads, thin limbs, simple faces, flat colour clothing) composited over 3D-rendered sets
with realistic lighting and texture: a cell block with coloured bars, a cutaway of layered soil, a vault with a big dial, a street
seen from above. Characters are drawn with a dark outline and sit "in" the set (they scale and move with the camera, with contact
shadows). The contrast between flat character and deep set is the signature.

## Camera grammar
1. **Slow push-in** on a character against a deep set (most shots).
2. **Low-angle hero shot** looking up at a character (guards, the escapee) to give them size.
3. **Face close-up** (head fills about half the frame height) for the comic beat; hard cut to it.
4. **Vertical fly-through / descent** that travels underground, then up to the street (scale-reveal, signature shot).
5. **Slight handheld drift** layered over holds so static shots never fully freeze.
6. **Over-the-shoulder / reveal** where a foreground object slides out of frame to show the second character.

## Transition grammar
- **Hard cut on a caption word** is the default (about 70 % of cuts).
- **Dissolve / crossfade** (~0.3–0.5 s) for time or location jumps.
- **In-world device overlay**: a CCTV monitor frame (camera id, REC dot, date-time stamp) fades in and becomes the scene change.
- **Whip/slide of a foreground object** across the lens as a wipe.

## Pacing
A new shot about every 1.3 s, captions change every 0.4–0.5 s, the camera is almost always moving. Variation comes from a few
held shots (≈2–3 s) at jokes, not from slowing the cut rate.

## Process (inferred)
script → shot list (one set per beat) → narration → sets and characters → camera move per shot → cut on narration words →
word-by-word captions timed to the voice → music/foley (not verified) → export vertical.

## Do not copy
The story, characters and their designs, the channel name/handle, the platform interface (counts, search bar, buttons), and the
reel's title. Reuse only the techniques listed above.
