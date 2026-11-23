# Brandwake episodes (channel: "why brands rise, and why they fall")

Channel promise (from its description): follow the money, the decisions and the timing behind restaurants, retail and consumer brands: the ones that ruled their moment, the ones that vanished, the ones that adapted just in time. Each episode finds **the one number or choice that explains the story**, shows who paid whom, where growth came from and where it broke. **Figures on screen come with sources; when the data is uncertain, say so.** New episodes weekly.

Kit: `kits/brandwake.json` (deep-water teal + signal coral, ripple-ring "wake" backgrounds, rail RISE / PEAK / BREAK / WAKE, calm broadcaster voice).

## Episode formula (Short, 45-58 s)
| Act | Rail | Transition | Content |
|---|---|---|---|
| Hook (0-4 s) | - | - | The paradox in one line + the key number ("Sold in 40 countries. Gone in 18 months.") |
| Rise | RISE | `wipe-up` | What they did right; a growth number; who paid whom |
| Peak | PEAK | `iris` | The moment of maximum; the decision that looked smart |
| Break | BREAK | `cut` (once) | The number that flipped: debt, margin, closures, share |
| Wake | WAKE | `wipe-left` | What it left behind; the lesson banner; a closing question |

Use a tug counter (brand vs competitor, revenue vs debt) or a single counter (stores, revenue, share). Every number gets a `source` pill the moment it first appears.

## Sourcing and honesty rules (non-negotiable for this channel)
1. Every figure on screen has a public source (filing, press release, reputable report); write it in `FACTS.md` with URL, date and the quoted wording. Show it with a `source` item (`{"type":"source","text":"Company annual report, 2019","at":"..."}`).
2. Estimates, approximate or disputed numbers get `"estimate": true` (shows an ESTIMATE tag) and the voiceover says "about" or "reportedly".
3. State what happened, not hidden motives. Attribute claims ("according to ...", "the company said ..."). No defamatory framing; no claims about a living person's intent or character.
4. Distinguish cause from correlation: say "one reason" unless sources show it was the cause.
5. Use brand names only to report documented facts. Do not use logos or trademarked artwork; use the generic props (stand, tower, truck, box, phone) and typographic name cards. Mention in the description that the video is commentary and not affiliated with the brands.
6. If you cannot find a source for a number, cut the number. Never invent figures for a real brand. Fictional composites must be labelled fictional.
7. Check the date: brand facts change; state the as-of date in the description.

## Research -> episode steps
1. Pick the brand and the one question ("Why did X collapse after Y?").
2. Collect 5-8 sourced numbers; choose the one that explains the story; discard the rest.
3. Beat sheet (see `story-craft.md`), script, voice, spec, build, QA, then re-check every figure against `FACTS.md` before delivery.
4. Metadata: hook-first title (< 60 chars), description with the as-of date and source list, 3 hashtags, pinned-comment question.
