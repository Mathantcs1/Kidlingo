# IT Life episodes (channel: "IT life moments you thought only happened to you")

Kit `kits/it-life.json` (voice fPIfC3elMLbN9tNwMXkw, chosen by the owner). Scripts come from the owner's plan (30 scripts, schema in their production guide: scene blocks with Visual / Text / VO); VO is read verbatim.
Look (deliberately NOT the Pride Parables / Brandwake look): thin-line stick figures (`itdev`: Dev; `itdev` with `tie`,`tablet`,`tall`: Manager), flat location backdrops (`itroom` desk with wall clock, `itmeet` 2015/2026 meeting room, `itscale` building/city/planet/space, `itcall` video-call grid), plain white / amber / teal cards (`rect`), no counter, chips, stamps or gold type. 2015 = amber on cream, 2026 = teal on navy. Time flip = `clockspin` item over an iris.

Per episode (do all of it, in this order)
1. Write `script.txt` = the VO lines; `python3 scripts/tts.py <proj> --voice fPIfC3elMLbN9tNwMXkw --speed 0.82 --max-gap 0.55` (speed 0.82-0.9 keeps 150-170 words at 60-65 s; owner minimum is 60 s).
2. Make `design/sheet.json` (characters, locations, materials for THIS episode: new locations/props, not the last episode's) and render `node scripts/sheet.mjs <proj>/design/sheet.json <proj>/design/sheet.png`. Look at it. Deliver it with the video.
3. Write `gen_spec.py` with `scripts/specdsl.py` (`from specdsl import *`), finish with `restage(spec)` (uses the lower third: bigger backdrop/figures, caption at y=1475) then `dump(...)`.
4. `node scripts/qa.mjs`, stills at phone size (contact sheet), fix, `sh scripts/build.sh`, `sh scripts/loud2.sh`, poster from `short_final.mp4`.
Known limits: UI covers y > ~1630; dark hoodie was unreadable on navy so Dev's hoodie is blue-grey; the Manager is tiny in the space scenes by design.

## Retention rules (from S06 analytics: 61.7% swiped away, avg view 27 s of 72 s, midsection drop)
- Line 1 of the VO and frame 0 show the CONFLICT, not the atmosphere ("11 people on a bridge call, nobody knows who owns it"). Scene setting (dinner, time of day) comes after, in one clause.
- Frame 0 is never a calm room: a problem on screen (wrong-order graph, red alert, many "?" bubbles) plus a top card of 5 words or fewer.
- Cut the midsection: one beat per idea, no recap between the fix and the 2015-vs-2026 reveal. Land the payoff by ~75% of the runtime, then the question.
- Length: aim 58-64 s of VO (the owner's floor is 60 s); trim script lines, do not slow the voice to pad. Only go to 70 s+ when every beat adds a new reveal.
- Keep the owner's script wording and meaning; reorder/trim only, and show the edit in the chat before building when a line is removed.

## Cinematic camera transitions (owner request: "like camera movements, not swipes between screens")
Use these act transitions instead of wipe/iris/push: `whip-left`, `whip-right` (fast pan with horizontal motion blur), `tilt-up`, `tilt-down` (vertical whip), `push-in` (dolly through the scene, good for time flips). The whole stage moves and blurs 0.3 s before the cut, the scene cuts at the act start, and the new scene settles in over 0.5 s; captions stay steady. Pick the move that matches the story (push-in for 2015 -> 2026, tilt-up for a realisation, whip for a plain scene change). Older episodes (1-10) still use the old wipes.

## Movable characters (itdev, itpal are rigged: arms, legs, head)
Idle sway is automatic. Walking is automatic while a prop glides (`move`), or force it with `walk:{at,until}`. Timed gestures on any rigged figure: `gest:[{at:"word",kind:"wave|raise|raiseL|point|nod|shake|shrug|cheer|lean",dur:1.2}]`. Bring a character in "as needed": place it off-screen (x=-150 or 1300) with `enter:"none"`, give it `move:{x:...,dur:1.1,at:"word"}`, and it walks on; give a second `move` act or `until` to take it off. Use `bob:0` on rigged figures. Sitting figures are not rigged. In S11: applicants walk into the line, the interviewer nods and waves, Dev shakes his head, shrugs and walks in to the final door.

## Episode workflow v2 (use for every new IT Life episode)
1. **Script pass** (retention rules above): conflict-first line 1, trim the middle, 58-64 s of VO, show the edit. Spell numbers out ("twenty fifteen"); the time-ref matcher strips punctuation and hyphens ("take-home" -> `takehome`).
2. **Beat sheet before the spec**: one line per sentence of VO: which character does what on which word, e.g. `"email" -> Dev shakes head`, `"hundred" -> applicants walk in`, `"Can" -> interviewer waves`. Every act needs at least one character action tied to a word, and no act is a static tableau for more than ~4 s.
3. **Movement tied to dialogue**: use `move` (characters glide and walk by themselves), `gest:[{at:"word", kind, dur}]` (wave, raise, point, nod, shake, shrug, cheer, lean), `walk:{at,until}`, `until`/`enter` for objects. Anchor to the spoken word, not to seconds.
4. **Cinematic transitions at every act boundary**: `whip-left/right`, `tilt-up/down`, `push-in` (never wipe/iris). Choose by meaning: push-in for a time flip or "going through" something, tilt-up for a realisation or ending, whip for a plain scene change.
5. **Fresh sheet** (characters, locations, props) per episode; new props go into `engine/props.js`.
6. **QA + stills**: `node scripts/qa.mjs`, then stills at each act start, at one transition mid-move (act start -0.15 s) and at every gesture; check edges (no figure cut off: keep x between 80 and 1000), figure/door overlaps, text >= 40 px.
7. Build, `loud2.sh`, poster, deliver video + poster + sheet, commit and push.
