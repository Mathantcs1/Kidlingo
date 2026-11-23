# Transitions

Set per act: `"transition": "iris"` or `{ "type": "iris", "x": 220, "y": 1000, "lead": 0.3 }`. Default from `kit.transition`, else `wipe-up`. `lead` = seconds the transition runs before the act's `from` word (default 0.28). Items from the previous act fade as the transition starts; the new act's items appear after it.

| type | what it looks like | use it for |
|---|---|---|
| `wipe-up` | new colour rises from the bottom | level up, progress, the next stage of a climb |
| `wipe-down` | new colour drops from the top | a fall, a loss, "then it got worse" |
| `wipe-left` | new scene enters from the right | time passing (Year 1 -> Year 2) |
| `wipe-right` | new scene enters from the left | flashback, "before" |
| `iris` | circle opens at `x,y` | focus / reveal of a person or object; set x,y on the subject |
| `diagonal` | slanted sweep | rivals, contrast, "meanwhile" |
| `shutters` | horizontal blinds open (`bars` = blind height, default 160 px) | tension, a closing door, secrets |
| `push` | new scene slides over | next chapter |
| `zoom` | new scene scales in and fades up | change of scale, "years later" |
| `cut` | instant, with shake + white flash | impact: the reversal, the crash, the number that flips |

Rules of thumb
- A transition marks a change of act. Do not add one inside an act; use pops, stamps and counter moves there.
- 3-4 types per video at most; `cut` once, on the turn.
- Reversal beats: `cut` or `wipe-down`. Rise beats: `wipe-up` or `zoom`. Time beats: `wipe-left`.
- Always look at stills *inside* the transition (about 0.1-0.2 s before the act word) to confirm nothing overlaps badly.
- Palette change is part of the transition: pick a clearly different `bg` for the next act.
