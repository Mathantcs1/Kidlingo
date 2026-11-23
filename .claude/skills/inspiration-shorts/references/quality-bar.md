# Quality bar (check before delivering)

Fail the video if any item is false. These are the failures that make Shorts feel "useless".

## Story
- [ ] First 3 seconds contain the irony or the final number, not a title or greeting.
- [ ] Every beat adds a new number or a new fact. No beat repeats the previous one.
- [ ] Arithmetic is consistent between voice, chips and counter (recompute it).
- [ ] The lesson is one banner of <= 5 words; the last line echoes the hook; a question closes it.
- [ ] Names, prices, years are specific. No "a company", "a man" without detail.

## Picture
- [ ] `scripts/qa.mjs` passes (no off-frame text, no text-on-text, no text-over-prop).
- [ ] Something new appears every 1-2 s (chip, prop, stamp, counter move). No dead air.
- [ ] One accent colour per act; contrast OK on every background (check light backgrounds: white text on light needs a dark chip).
- [ ] Props are readable at phone size; text is >= 38 px; nothing important sits in the bottom 15% or right 12% (YouTube UI).
- [ ] Transitions are wipes/pops from the same grammar, not default fades.

## Sound
- [ ] Voice clear and ~-14 LUFS overall; every popped chip, stamp, coin or wipe has a sound.
- [ ] At least one near-silence before the turn (the reversal beat).
- [ ] No clipping; check `build.sh` loudness line.

## Delivery
- [ ] 1080x1920, h264 + aac, under 59 s.
- [ ] `FACTS.md` present if any real person, company, repo or statistic is used.
- [ ] Title (hook first, < 60 chars), description (2 lines + 3 hashtags), pinned comment question.
- [ ] Fictional stories say so; the AI-narration/synthetic disclosure is mentioned to the user.
