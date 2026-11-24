"""Batch 2 spec helpers (on top of specdsl). Layout: locations at scale 1.2 anchored y=1450 (spans y 370-1450), characters stand on y~1452,
caption at y=1475 (kit override), lesson banners at the top (y ~330)."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from specdsl import *

DY = 170  # everything sits 170 px lower than the old layout so the bottom third is filled (UI covers y > ~1630)
def P(act, id, x, y, sc, at=0, opts=None, enter='none', **k):
    if 'move' in k and 'y' in k['move']: k['move'] = dict(k['move'], y=k['move']['y'] + DY)
    return dict(act=act, type='prop', id=id, x=x, y=y + DY, scale=sc, enter=enter, at=at, opts=opts or {}, bob=k.pop('bob', 0), **k)
def LOC(act, id, at=0, y=1450, sc=1.2, x=540, **k): return P(act, id, x, y, sc, at, qa=False, **k)
def ACT(act, x, sc, opts, at=0, enter='none', y=1452, **k): return P(act, 'actor', x, y, sc, at, opts, enter, **k)
def PR(act, x, y, sc, at=0, mood='smug', enter='pop', **k):
    o = dict(mood=mood); o.update(k.pop('opts', {})); k.setdefault('tag', 'pride'); return P(act, 'pride2', x, y, sc, at, o, enter, **k)
def swap(items, t, **delta):
    """clone the last item with changed opts at time t; the old one fades at t (instant mood change for stationary characters)"""
    old = items[-1]; old['until'] = t; n = dict(old); n.pop('until', None); n['opts'] = dict(old['opts'], **delta); n['at'] = t; n['enter'] = 'none'; return n
def cam(*keys): return [dict(at=k[0], **k[1]) for k in keys]
def whip(d): return dict(type=d)
