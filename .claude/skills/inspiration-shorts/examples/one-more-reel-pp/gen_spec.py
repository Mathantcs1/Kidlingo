#!/usr/bin/env python3
"""One More Reel (Pride Parables). Beat sheet: shorts-handoff/batch2/SCRIPTS.md #1. Everything is anchored to spoken words."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../scripts'))
from specdsl2 import *

ACEO = dict(ACE, hood=True, body="#3a4a9f", body2="#2c3a80", band="#e0543a", tie=None)
SAMO = dict(body="#1e6b57", body2="#14513f", hair="#1c1c24", hood=True, hairStyle="long")
BG = {"night": {"angle": 180, "stops": ["#0b1038", "#171a4a", "#1d2150"], "dots": {"o": .05}},
      "dawn": {"angle": 180, "stops": ["#c2456b", "#e0765a", "#ffd7a8"]},
      "end": {"angle": 180, "stops": ["#1d2150", "#2b2467", "#3b2a8a"], "blobs": [{"c": "#7a52d9", "x": 540, "y": 900, "r": 700, "s": .2, "dx": 60, "dy": 40, "o": .4}]}}
acts = [A("hook", bg="night"),
        dict(id="setup", from_="Three", bg="night", transition=whip("whip-right")),
        dict(id="reels", from_="Reel", bg="night", transition=whip("push-in")),
        dict(id="night", from_="one#2", bg="night", transition=whip("tilt-down")),
        dict(id="kitchen", from_="kitchen", bg="dawn", transition=whip("whip-left")),
        dict(id="dawn", from_="They", bg="dawn", transition=whip("tilt-up")),
        dict(id="end", from_="Pride#4", bg="end", transition=whip("whip-right")),
        dict(id="close", from_="What", bg="end", transition=whip("tilt-up"))]
for a in acts:
    if 'from_' in a: a['from'] = a.pop('from_')
I = []
def add(*xs): I.extend(xs)

# ---------- HOOK (2:14, Ace slumped, phone glow, Pride grinning) ----------
add(LOC("hook", "bedroom"), P("hook", "bed", 520, 1440, 1.2, 0, enter="none") if False else None)
I[:] = [i for i in I if i]
BED = lambda act: P(act, "bed", 520, 1445, 1.2, qa=False)
add(ACT("hook", 240, 1.75, dict(ACEO, mood="tired", hold="phone", glow="#7fe3ff"), y=1330, gest=[dict(at="Seven", kind="lean", dur=1.4), dict(at="fourteen", kind="shake", dur=1.2)]), BED("hook"),
    PR("hook", 840, 1190, 1.0, at=.6, mood="smug", enter="rise", dist=300, opts=dict(hold="popcorn")),
    P("hook", "bigphone", 300, 1040, .0001, 0, dict(screen="blank")) if False else None)
I[:] = [i for i in I if i]
add(chip("hook", 470, [("7 MINUTES?", "Seven", None)], size=60, bg="#7fe3ff"))
I[-1]['color'] = "#0b1038"

# ---------- SETUP (11:07 PM, ten slides, plan) ----------
add(LOC("setup", "bedroom"),
    P("setup", "laptop", 230, 1255, 1.1, "earlier", enter="slide-left", dist=700),
    ACT("setup", 240, 1.75, dict(ACEO, mood="worried"), y=1330, gest=[dict(at="plan", kind="point", dur=1.2), dict(at="presentation", kind="nod", dur=1.0)]), BED("setup"),
    P("setup", "slidecard", 840, 760, 1.5, "presentation", enter="drop", dist=500, until="Pride"),
    grid("setup", 140, 345, 800, 64, 10, 1, "ten", [], base="rgba(255,255,255,.35)"),
    chip("setup", 435, [("SLIDES DONE: 0 / 10", "ten", None)], size=40, bg="#ffd21f"),
    P("setup", "bigphone", 600, 1230, .85, "reels", dict(screen="blank"), enter="rise", dist=500),
    P("setup", "laptop", 230, 1255, 1.1, "work", enter="none", until="work", move=dict(x=1300, dur=1.0, at="work")) if False else None)
I[:] = [i for i in I if i]
I[-5]['until'] = "work"; I[-5]['move'] = dict(x=-400, dur=1.0, at="work")   # laptop slides off on "work"
add(PR("setup", 880, 1190, 1.0, at="settled", mood="smug", enter="rise", dist=300, opts=dict(hold="popcorn")),
    chip("setup", 1110, [("YOU'RE IN CONTROL", "obviously", None)], size=40, bg="#fff"))

# ---------- REELS (cat, staircase, midnight) ----------
add(LOC("reels", "bedroom"), ACT("reels", 220, 1.75, dict(ACEO, mood="happy"), y=1330, gest=[dict(at="cat", kind="cheer", dur=1.0), dict(at="stop", kind="point", dur=1.2)]), BED("reels"),
    PR("reels", 880, 1190, 1.0, at=0, mood="smug", enter="none", opts=dict(hold="popcorn"), gest=[]),
    P("reels", "bigphone", 600, 1230, .85, 0, dict(screen="reel1"), enter="none", until="nine", tag="phone"),
    P("reels", "bigphone", 600, 1230, .85, "nine", dict(screen="reel2"), enter="rise", dist=700, tag="phone"),
    chip("reels", 435, [("REEL 1", "Reel", None), (" > REEL 9", "nine", "#ff7ab8")], size=44, bg="#fff"),
    stamp("reels", "12:00 AM", "midnight", y=620, color="#e0543a", size=64, hit=True))
add(dict(act="reels", type="hit", at="midnight", shake=.25, flash=.15))
add(chip("reels", 1110, [("I CAN STOP WHENEVER I WANT", "stop", None)], size=40, bg="#fff"))
I[-1]['until'] = "nodded"

# ---------- NIGHT (1 a.m. sleep video, 2:14 zero slides, buzz, Sam rescues) ----------
add(LOC("night", "bedroom"), ACT("night", 220, 1.75, dict(ACEO, mood="tired"), y=1330, gest=[dict(at="habits", kind="nod", dur=1.4), dict(at="buzzed", kind="raise", dur=1.0), dict(at="answer", kind="shake", dur=1.4)]), BED("night"),
    PR("night", 880, 1190, 1.0, at=0, mood="cackle", enter="none", opts=dict(hold="popcorn")),
    P("night", "bigphone", 600, 1230, .85, 0, dict(screen="sleep"), enter="none", until="buzzed", tag="phone"),
    P("night", "bigphone", 600, 1230, .85, "buzzed", dict(screen="chat"), enter="none", jitter=5, tag="phone"),
    grid("night", 140, 345, 800, 64, 10, 1, 0, [dict(**{"from": 0, "count": 10, "c": "rgba(224,84,58,.0)", "at": "zero"})], base="rgba(255,255,255,.35)"),
    chip("night", 435, [("SLIDES DONE: 0 / 10", "zero", "#ff7a7a")], size=40, bg="#fff"),
    stamp("night", "0 / 10", "zero", y=640, color="#e0543a", size=72, hit=True),
    chip("night", 1110, [("SAM: LIGHT ON?", "Sam", None)], size=40, bg="#fff"))
I[-1]['until'] = "Pride#3"
I[-1]['at'] = "Sam"
# Sam walks in and takes the phone
add(ACT("night", -250, 1.5, SAMO, y=1452, move=dict(x=720, dur=1.6, at="walked"), enter="none", until="took"),
    ACT("night", 720, 1.5, dict(SAMO, hold="phone", glow="#7fe3ff"), y=1452, at="took", enter="none", move=dict(x=1350, dur=1.5, at="put")),
    PR("night", 880, 1190, 1.0, at="whispered", mood="hiss", enter="none", opts=dict(), x=500) if False else None)
I[:] = [i for i in I if i]
add(chip("night", 1110, [("DON'T ANSWER", "whispered", None)], size=40, bg="#fff"))
I[-1]['until'] = "typed"
add(dict(act="night", type="typing", x=240, y=700, w=600, h=120, text="Help", at="typed", dur=.5, size=60, bg="#fff"))

# ---------- KITCHEN (phone next to the kettle) ----------
add(LOC("kitchen", "kitchenette"),
    P("kitchen", "kettle", 760, 1050, 1.1, "kettle", dict(steam=True), enter="drop", dist=600),
    ACT("kitchen", -250, 1.5, dict(SAMO, hold="phone", glow="#7fe3ff"), y=1452, move=dict(x=420, dur=1.4, at="kitchen+0.2"), gest=[dict(at="kettle", kind="point", dur=1.3)], until="put"),
    ACT("kitchen", 420, 1.5, SAMO, y=1452, at="put", gest=[dict(at="seven#4", kind="wave", dur=1.4)]),
    P("kitchen", "bigphone", 640, 1050, .28, "put", dict(screen="reel1"), enter="drop", dist=500),
    chip("kitchen", 420, [("SEE YOU AT 7", "Come", None)], size=48, bg="#fff"))
I[-1]['at'] = "Come"

# ---------- DAWN (finish slides, clock runs) ----------
add(LOC("dawn", "kitchenette"),
    P("dawn", "laptop", 700, 1050, 1.1, "They", enter="slide-right", dist=600),
    ACT("dawn", 300, 1.5, SAMO, y=1452, gest=[dict(at="four", kind="nod", dur=1.0)]),
    ACT("dawn", 1350, 1.5, dict(ACEO, mood="happy"), y=1452, move=dict(x=860, dur=1.3, at="They"), gest=[dict(at="presented", kind="cheer", dur=1.6)]),
    grid("dawn", 140, 345, 800, 64, 10, 1, "They", [dict(**{"from": 0, "count": 10, "c": "#32c88a", "at": "ten", "end": "four"})], base="rgba(255,255,255,.35)"),
    chip("dawn", 435, [("SLIDES DONE: 10 / 10", "four", "#139f7d")], size=40, bg="#fff"))
I[-1]['at'] = "four"

# ---------- END (Pride, offended, lesson) ----------
add(LOC("end", "bedroom"), BED("end"),
    PR("end", 560, 1180, 1.6, at=0, mood="offended", enter="none", opts=dict(), gest=[]),
    stamp("end", "0 REELS", "Not", y=560, color="#7fe3ff", size=72, hit=True),
    banner("end", "PUT IT IN THE KITCHEN", "Humility", y=700, size=52))
I[-1]['at'] = "Humility"
I[-1]['until'] = "What"

# ---------- CLOSE ----------
add(ACT("close", 190, 1.9, dict(ACEO, mood="happy"), y=1452, gest=[dict(at="Every", kind="wave", dur=1.4)]),
    ACT("close", 540, 1.9, SAMO, y=1452, gest=[dict(at="fall", kind="nod", dur=1.0)]),
    PR("close", 890, 1452, 1.5, at=0, mood="sulk", enter="none", opts=dict(), gest=[]),
    chip("close", 440, [("WHAT WOULD YOU HAND", "What", None)], size=48, bg="#fff"),
    chip("close", 550, [("A FRIEND AT 2 A.M.?", "friend", None)], size=48, bg="#fff"),
    dict(act="close", type="gold", y=650, size=76, parts=[dict(t="EVERY FALL BEGINS", at="Every")]),
    dict(act="close", type="gold", y=745, size=60, parts=[dict(t="WITH ONE PROUD DECISION", at="one#3")]))

counter = dict(act="hook", keys=[[0, 1574], ["earlier", 1574], ["earlier+1.2", 1387], ["midnight", 1440], ["one#2", 1500], ["Two", 1574], ["four", 1680], ["presented", 1980]],
               prefix="", fmt="clock", until="Humility", y=160, size=130)
spec = dict(kitFile="../../kits/pride-parables.json", kit=dict(bgs=BG, caption=dict(y=1475)), tail=1.0, acts=acts, counter=counter, items=I,
            camDrift=4,
            cam=cam((0, dict(s=1.0, x=0, y=0, fx=300, fy=1000)), ("earlier", dict(s=1.12)), ("Reel", dict(s=1.0, fx=560, fy=1000)), ("midnight", dict(s=1.22)),
                    ("Two", dict(s=1.3, fx=560, fy=1050)), ("zero", dict(s=1.0, fx=540, fy=960)), ("buzzed", dict(s=1.18, fx=560, fy=1000)), ("whispered", dict(s=1.1, fx=450, fy=1000)),
                    ("took", dict(s=1.0)), ("Pride#4", dict(s=1.0, fx=560, fy=1180)), ("Humility", dict(s=1.25, fx=560, fy=1180)), ("What", dict(s=1.0, fx=540, fy=960))),
            focus=[dict(at="stop", until="rush", keep=["pride"], blur=7)])
dump(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'spec.json'), spec)
print('spec ok', len(I), 'items')
