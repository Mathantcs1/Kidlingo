"""Tiny helpers to write spec.json from Python (fewer typos, consistent layout).
usage in a generator script:  import sys; sys.path.insert(0, '<skill>/scripts'); from specdsl import *
Layout facts baked in: chips at y=548 / 668; a person at scale s is 420*s px tall (bottom at y=1285), so with TWO chip rows
keep s <= 1.15, with ONE chip row s <= 1.5; grid/rect rows between 650 and 780 need s <= 1.1.
Time refs: trailing punctuation is stripped by dump(), so you can paste words straight from words.json."""
import json, re
ACE = dict(body="#3a4a9f", body2="#2c3a80", hair="#3b2a20", tie="#ffd21f", band="#e0543a")
SAM = dict(body="#1e6b57", body2="#14513f", hair="#1c1c24")
MIRA = dict(body="#b5482f", body2="#8f361f", hair="#2b2b33", glasses=True, skin="#c68642")
R, B, G, V = "#e0543a", "#2f6fd6", "#139f7d", "#7a52d9"

def chip(act, y, parts, size=46, bg="#fff"):
    return dict(act=act, type="chip", y=y, size=size, bg=bg, parts=[dict(t=t, at=a, **({'c': c} if c else {})) for t, a, c in parts])
def person(act, x, sc, o, at=0, enter="none", **k):
    return dict(act=act, type="prop", id="person", x=x, y=1285, scale=sc, enter=enter, at=at, opts=o, bob=.6, **k)
def prop(act, id, x, sc, at, opts=None, enter="pop", y=1285, **k):
    return dict(act=act, type="prop", id=id, x=x, y=y, scale=sc, enter=enter, at=at, opts=opts or {}, bob=k.pop('bob', .5), **k)
def rect(act, x, y, w, h, at, bg, text, size, enter="pop", **k):
    return dict(act=act, type="rect", x=x, y=y, w=w, h=h, at=at, bg=bg, enter=enter, text=text, size=size, qa=False, **k)
def stamp(act, text, at, y=1510, color=R, size=48, hit=False):
    return dict(act=act, type="stamp", text=text, at=at, y=y, hit=hit, color=color, size=size)
def banner(act, text, at, y=1478, size=30): return dict(act=act, type="banner", text=text, at=at, y=y, size=size)
def source(act, text, at, y=1470, estimate=False):
    d = dict(act=act, type="source", text=text, at=at, y=y)
    if estimate: d['estimate'] = True
    return d
def grid(act, x, y, w, h, cols, rows, at, groups, **k): return dict(act=act, type="grid", x=x, y=y, w=w, h=h, cols=cols, rows=rows, at=at, groups=groups, **k)
def A(id, frm=None, bg="night", tr=None, title=None, col=V, rail=None):
    d = dict(id=id, bg=bg)
    if frm is not None: d['from'] = frm; d['transition'] = tr or "wipe-up"
    if rail is not None: d['rail'] = rail
    if title: d['title'] = dict(text=title, bg=col, y=415)
    return d
def _clean(o):
    if isinstance(o, dict): return {k: (re.sub(r"[,.?:;!]+(?=($|[+-]))", "", v) if k in ("at", "end", "until", "from") and isinstance(v, str) else _clean(v)) for k, v in o.items()}
    if isinstance(o, list): return [_clean(x) for x in o]
    return o
def dump(path, spec):
    json.dump(_clean(spec), open(path, "w"), indent=1)

BACKDROPS = ("itroom", "itmeet", "itscale", "itoffice", "itpantry", "itplain")
def restage(spec, base=1430, room_k=1.25, dev_k=1.3, prop_k=1.25, xk=1.2, cap_y=1475):
    """IT Life layout: use the empty lower third. Backdrops are anchored at `base` and enlarged, stick figures and props are
    enlarged and re-anchored around the same ground line, mid-screen cards keep their position relative to the room, and the
    caption moves down to `cap_y` (YouTube's own UI covers y > ~1630). Top cards (y < 520) are left alone."""
    for it in spec["items"]:
        if it.get("type") == "prop":
            if it["id"] in BACKDROPS:
                it["y"] = base; it["scale"] = round(it["scale"] * room_k, 3)
            else:
                k = dev_k if it["id"] in ("itdev", "itpal") else (1.1 if it["id"] == "itcall" else prop_k)
                it["y"] = round(base - (1285 - it["y"]) * k); it["scale"] = round(it["scale"] * k, 3); it["x"] = round(540 + (it["x"] - 540) * xk)
                mv = it.get("move")
                if mv:
                    if "x" in mv: mv["x"] = round(540 + (mv["x"] - 540) * xk)
                    if "y" in mv: mv["y"] = round(base - (1285 - mv["y"]) * k)
        elif it.get("type") == "rect" and it["y"] >= 520:
            it["y"] = round(base - (1285 - it["y"]) * room_k)
    spec.setdefault("kit", {}).setdefault("caption", {})["y"] = cap_y
    return spec
