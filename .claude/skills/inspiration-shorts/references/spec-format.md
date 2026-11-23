# spec.json format

A project folder holds `script.txt`, `vo.mp3`, `words.json` (from `tts.py`) and `spec.json`. Output goes to `out/`.

```jsonc
{
  "kitFile": "../../kits/pride-parables.json",   // optional channel kit (path relative to the project)
  "kit": { "rail": [{"label":"1 LABOR","color":"#ff5d73"}] },   // optional inline overrides
  "tail": 0.7,                                    // seconds after the last word
  "acts": [ { "id":"hook", "bg":"night" },
            { "id":"a1", "from":"marcus", "bg":"steel", "transition":{"type":"iris","x":220,"y":1000}, "rail":0,
              "title": { "text":"HALDEN LOGISTICS", "bg":"#3b5bdb", "y":415, "at":"marcus" } } ],
  "counter": { "act":"a1", "keys":[[0,20],["eighty#2",20],["eighty#2+0.9",80]], "prefix":"$", "fmt":"full" },
  "items": [ ... ]
}
```

## Time references
A number is seconds. A string is a word in the narration: `"stops"` (start of the first "stops"), `"stops#2"` (2nd occurrence, 1-based), `"stops@end"` (end of the word), plus an optional offset: `"stops+0.3"`, `"nine#2-0.1"`. Matching ignores case and punctuation. An unknown word fails the build with a clear message. Use `node scripts/render.mjs <project> events` and read `words.json` to find words.

## Acts
Each act has a `transition` (see `transitions.md`; default `wipe-up`) and a background preset (`night, mint, amber, violet, sunset, ink, paper, steel`, or any key you add in the kit `bgs`), starts at `from` (first act starts at 0) and arrives with a bottom-up wipe that begins `wipe` seconds earlier. Items belong to an act and fade out when the next act's wipe begins. Give an item `"to":"a4"` to keep it alive through later acts (the tug counter does this). `title` adds a pill chip; `rail` highlights an index of `kit.rail`.

## Items (all take `act`, and optionally `until` = a time ref after which they fade)
| type | fields |
|---|---|
| `gold` | big gold outlined text row: `y, size, parts:[{t, at, c?}]` |
| `chip` | pill with progressive parts: `y, size, bg, color, pad, text` or `parts:[{t,at,c?}]` |
| `stamp` | slams in with shake + flash: `text, at, y, rot, color, size, hit:false` to disable shake |
| `banner` | slides in from the right (use for the lesson): `text, at, y, size, color` |
| `prop` | an illustration: `id, opts, x, y (bottom-centre), scale, enter, at, bob, talk, armAt/armUntil, grayAt, rot, dist` |
| `coins` | falling coins: `at, n, x, y0, y1` |
| `tug` | two money counters + split bar: `at, y, fmt, left:{label,color,keys}, right:{...}`; keys `[[ref, value],...]` |
| `hit` | shake/flash on a word: `at, shake, flash` |

`prop.enter`: `pop, rise, drop, slide-left, slide-right, none`. `talk:true` flaps the mouth while the narrator speaks (person only). `fmt` for money: `short` ($50K, $9M) or `full`/`plain`.

## Props (in `engine/props.js`)
`person` (opts: body, body2, pants, skin, hair, hat, tie, shirt, hood, glasses, brow), `stand` (label, color), `tower` (label, rows, color), `phone` (label, screen), `box` (label), `truck` (label, cab), `letter` (lines, color), `doc` (label), `bill` (label), `coin`, `bottle`, `cup`. To add a prop, add a function to `props.js` that returns `wrap(viewBox, w, h, svgBody)`; keep stroke weight 7 and the ink colour so the set stays consistent.

## Layout grid (1080x1920)
Counter/tug y 150-400 · title chip y ~415 · chips y ~548 and ~668 · scene (props anchored on y ~1170-1200) · caption y 1262 · banner y 1130-1440 · bottom 15% and right 12% are covered by YouTube UI, keep important content out.

## Commands
```
python3 scripts/tts.py <project>
node scripts/qa.mjs <project>
node scripts/render.mjs <project> stills 1.5,6,12
sh scripts/build.sh <project> [--music bed.mp3]
```

## Backgrounds (original system)
Presets: `night, mint, amber, violet, sunset, ink, paper, steel`. Each is a diagonal gradient (`angle`, `stops`) plus optional drifting colour glows (`blobs:[{c,x,y,r,s,dx,dy,o}]`), a faint dot texture (`dots:{c,o,s}`) and layered rolling hills (`hills:{y, colors:[3]}`) that slowly drift. Define or override any preset in a kit's `bgs` to give a channel its own look; change the hue, the blob positions and whether hills are used. Do not add spotlight rays or star fields: they belong to the reference video this skill is deliberately different from.
