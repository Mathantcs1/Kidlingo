# Story craft for money / lesson / parable Shorts

Derived from a reference Short (a four-level "$20 to $120,000" lesson) the user supplied, reduced to principles. Use the principles; invent your own content.

## Why the reference works (and generic AI Shorts do not)
1. **One number keeps moving.** A counter at the top ticks between values as each beat lands ($80 -> $1,200 -> $18,000 -> $120,000). The viewer stays to see where it ends. Equivalent for parables: a two-sided tug (his company vs theirs).
2. **Every beat has one visual action** that shows the idea: coins drop into a stand, a stamp slams `STOP = $0`, a bar crosses. Narration over a static image is the failure mode.
3. **Chips carry the fact, voice carries the story.** Short chips (`$20 = 80 CUPS`, `20% OF EVERY SALE`) pop on the exact word. Never put the full sentence on screen.
4. **Same template per act, new palette per act.** Title chip -> numbers -> metaphor -> lesson banner. Palette change + wipe marks the new act; the layout stays, so it feels like one system.
5. **A banner states the lesson in <= 5 words** (`MONEY AT WORK > TWO HANDS`). Say it, show it, move on.
6. **Hook, escalation, payoff, question.** Open on the final number or the irony; escalate; finish with an echo of the hook and a question that invites comments.
7. **Specific beats vague.** Names, prices, counts, years. "A startup" is nothing; "two founders in a garage, a phone app, fifty thousand dollars" is a story.

## Beat sheet template (fill before scripting)
| t | spoken line | number/fact | visual action | sound |
|---|---|---|---|---|
| 0-3 | hook: the irony or final number | both numbers visible | main prop enters | pop |
| 3-12 | setup: who, what, price | chip x2 | hero + object slide in | whoosh |
| 12-24 | beat 1: first change | counter moves | something visibly changes | coin/tick |
| 24-36 | beat 2: escalation | counter moves again | new prop, stamp or note | thud |
| 36-46 | beat 3: reversal / crossing | numbers cross | the irony lands | thud + silence |
| 46-55 | lesson + question | banner | big type, loop-friendly | whoosh |

## Lengths and pacing
- Owner's rule: minimum 60 s. Default 60-80 s; up to 3 minutes is allowed on Shorts. Length must be earned by story, never padding.
- Sentences of 3-9 words. Pauses longer than ~0.45 s are trimmed by `tts.py`.
- A beat is 8-12 s. If a beat needs a paragraph to explain, cut it.

## Using a public GitHub repository as the story
The numbers are the story: stars over time, first commit to first release, contributors, a rewrite, a rename, a milestone issue. Collect from the public repo page or API; write each claim and its URL into `FACTS.md`. Pick one arc (e.g. "one weekend project -> N thousand stars"), never invent figures, and if a number is approximate say "about". Show the repo's real name only if it is public and the claim is verifiable; otherwise write a fictional composite and label it fictional.

## Fictional parables
Name one person, one flaw (pride, greed, haste), one visible metric that tracks the flaw, one turn where the metric reverses, one line of moral. Label the story as fictional in the description.

## 60-90 second structure (how a minute holds attention)
A minute loses viewers unless something keeps pulling them forward. Build the script from open loops, not from a timeline.

| t | job | example (brand story) |
|---|---|---|
| 0-3 s | **Hook = the surprising end state, as a question** | "The company that lost the smartphone war just got a billion dollars from Nvidia." |
| 3-10 s | Promise + first number | "Here's how it fell, and why it's back." Show the peak number. |
| 10-25 s | Rise/peak with ONE concrete detail, ends on an open loop | "It was on half the world's phones. Then two launches changed everything." |
| ~25 s | **Re-hook**: a fact that reverses expectation | "The weird part: the phones weren't worse." (only if the sources support it) |
| 25-45 s | Escalation: the number keeps moving, each beat adds a new loss or a new choice | counter/bars move; one chart, one stamp, one cut |
| 45-55 s | **The turn / break**: the number or decision that explains it | impact cut, silence beat, big number |
| 55-70 s | **Payoff of the hook**: answer the opening question (why it's back) | the twist resolves |
| 70-80 s | Lesson (<= 5-word banner) + a question that invites comments | |

Rules for minute-plus Shorts
- Open the story from the END (the surprising present), then tell how we got there. The viewer stays to see the two connect.
- Never explain two things at once. One number, one picture, one sentence at a time.
- End every beat with a reason to stay ("but...", "then...", a visible question), never with a summary.
- Cut any sentence that does not add a new number, fact or turn. Time spent on dates is time lost.
- Vary beat length (6 s, 10 s, 4 s). Even pacing reads as a lecture.
- Use silence or a hit before the turn; the sound change re-grabs attention.
- Check retention honestly: after publishing, use YouTube Studio "stayed to watch" and the retention curve; every cliff in the curve is a sentence to cut or a beat to re-hook.
