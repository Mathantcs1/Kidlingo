#!/usr/bin/env python3
"""Weekly review from a YouTube Studio export.
usage: analytics.py <folder with 'Table data.csv' [+ 'Chart data.csv', 'Totals.csv']> [--out report.md]
Studio > Analytics > Content > (Shorts) > Advanced mode > export 'Table data' as CSV (and the chart data).
Prints per-video numbers, flags the rows you cannot trust (tiny counts, loops), compares title styles and upload cadence,
and lists the changes the data supports. Small samples prove little: the report says so."""
import csv, os, re, statistics, sys, collections, datetime

def secs(v):
    if not v: return None
    p = [int(x) for x in v.split(':')]
    while len(p) < 3: p.insert(0, 0)
    return p[0] * 3600 + p[1] * 60 + p[2]
def num(v):
    try: return float(v)
    except Exception: return None
def read(path):
    with open(path, encoding='utf-8-sig') as f: rows = list(csv.reader(f))
    return rows[0], rows[1:]

folder = sys.argv[1]; out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
h, rows = read(os.path.join(folder, 'Table data.csv'))
ix = {n: i for i, n in enumerate(h)}
def g(r, n): return r[ix[n]] if n in ix and ix[n] < len(r) else ''
total = next((r for r in rows if r[0] == 'Total'), None)
vids = []
for r in rows:
    if r[0] == 'Total': continue
    d = secs(g(r, 'Duration')) if ':' in g(r, 'Duration') else num(g(r, 'Duration'))
    v = dict(id=r[0], title=g(r, 'Video title'), pub=g(r, 'Video publish time'), dur=d, eng=num(g(r, 'Engaged views')) or 0,
             avg=secs(g(r, 'Average view duration')), pct=num(g(r, 'Average percentage viewed (%)')), stay=num(g(r, 'Stayed to watch (%)')),
             views=num(g(r, 'Views')) or 0, likes=num(g(r, 'Likes')) or 0, com=num(g(r, 'Comments added')) or 0, sh=num(g(r, 'Shares')) or 0,
             subs=num(g(r, 'Subscribers')) or 0, viewers=num(g(r, 'Unique viewers')) or 0)
    v['len'] = 'long' if (v['dur'] or 0) > 180 else 'short'
    v['hash'] = '#' in v['title']; v['q'] = '?' in v['title']; v['nchar'] = len(v['title']); v['digit'] = bool(re.search(r'\d', v['title']))
    v['trust'] = v['eng'] >= 10 and (v['pct'] or 0) <= 100
    vids.append(v)

L = []
P = L.append
P('# Weekly analytics report\n')
if total:
    P(f"**Totals:** {int(num(g(total,'Views')) or 0)} views, {int(num(g(total,'Engaged views')) or 0)} engaged views, {int(num(g(total,'Unique viewers')) or 0)} unique viewers, "
      f"{(num(g(total,'Watch time (hours)')) or 0):.2f} watch hours, subscribers net {int(num(g(total,'Subscribers')) or 0)} "
      f"(gained {int(num(g(total,'Subscribers gained')) or 0)}, lost {int(num(g(total,'Subscribers lost')) or 0)}), likes {int(num(g(total,'Likes')) or 0)}, "
      f"comments {int(num(g(total,'Comments added')) or 0)}, shares {int(num(g(total,'Shares')) or 0)}. Stayed to watch: {g(total,'Stayed to watch (%)') or 'n/a'}%.\n")
P('| Video | Published | Len s | Engaged | Avg view s | Avg % | Stayed % | Views | Likes | Com | Shares | Reliable? |')
P('|---|---|---|---|---|---|---|---|---|---|---|---|')
for v in sorted(vids, key=lambda x: -x['eng']):
    avgp = f"{v['avg']}" if v['avg'] is not None else '-'
    P(f"| {v['title'][:46]} | {v['pub']} | {int(v['dur'] or 0)} | {int(v['eng'])} | {avgp} | {v['pct'] if v['pct'] is not None else '-'} | {v['stay'] if v['stay'] is not None else '-'} | {int(v['views'])} | {int(v['likes'])} | {int(v['com'])} | {int(v['sh'])} | {'yes' if v['trust'] else 'NO: tiny sample or looped'} |")
P('\nRows marked NO have fewer than 10 engaged views or an average above 100% (usually the owner re-watching their own upload). Ignore their averages.\n')

shorts = [v for v in vids if v['len'] == 'short']; ok = [v for v in shorts if v['trust']]
P('## What the data supports')
if shorts:
    top2 = sorted(shorts, key=lambda x: -x['views'])[:2]; tv = sum(v['views'] for v in shorts) or 1
    P(f"- Concentration: the top two Shorts have {int(sum(v['views'] for v in top2))} of {int(tv)} Short views ({100*sum(v['views'] for v in top2)/tv:.0f}%). Look at what they share before copying anything else.")
if ok:
    mid = statistics.median([v['pct'] for v in ok if v['pct'] is not None] or [0])
    for v in ok:
        if v['avg'] is not None and v['dur']: P(f"- \"{v['title'][:50]}\": viewers watched {v['avg']} s of {int(v['dur'])} s ({100*v['avg']/v['dur']:.0f}%). A drop to this level means the payoff or a re-hook should land before about {max(10,int(v['avg']))} s.")
    for v in ok:
        if v['stay'] is not None: P(f"- \"{v['title'][:50]}\": stayed to watch {v['stay']}% => about {100-v['stay']:.0f}% swiped away in the first seconds (frame 0 and line 1 decide this).")
h_t = [v for v in shorts if v['hash']]; n_t = [v for v in shorts if not v['hash']]
if h_t and n_t:
    P(f"- Titles with hashtags in the title: {len(h_t)} videos, median engaged views {statistics.median([v['eng'] for v in h_t]):.0f}; without: {len(n_t)} videos, median {statistics.median([v['eng'] for v in n_t]):.0f}. (Confounded by publish date; keep hashtags in the description.)")
by_day = collections.Counter(v['pub'] for v in vids)
bad = [d for d, c in by_day.items() if c >= 3]
if bad: P(f"- Upload bursts: {', '.join(f'{d} ({by_day[d]} videos)' for d in bad)}. Several videos on one day split the first-day audience; keep to one per channel per day.")
titles = collections.Counter(' '.join(re.sub(r'[^a-z ]', '', v['title'].lower()).split()[:3]) for v in vids)
dup = [t for t, c in titles.items() if c > 1 and t.strip()]
if dup: P(f"- Possible duplicate uploads of one story (similar titles: {', '.join(dup)}). Upload each story once.")
longs = [v for v in vids if v['len'] == 'long']
for v in longs: P(f"- Long video \"{v['title'][:50]}\": {int(v['eng'])} engaged views. Do not make more long videos until Shorts are stable.")
if total:
    sh = num(g(total, 'Shares')) or 0; cm = num(g(total, 'Comments added')) or 0; vw = num(g(total, 'Views')) or 1
    if sh == 0 or cm / vw < 0.02: P(f"- Engagement: {int(cm)} comments and {int(sh)} shares on {int(vw)} views. Put a question chip around the turn (not only at the end, most viewers leave before it) and add one share line (\"send this to someone who...\").")
if os.path.exists(os.path.join(folder, 'Totals.csv')):
    th, tr = read(os.path.join(folder, 'Totals.csv'))
    series = [(r[0], num(r[1]) or 0) for r in tr]
    P('- Daily engaged views: ' + ', '.join(f"{d[5:]}: {int(v)}" for d, v in series) + '. Views arrive in the first 1-3 days after an upload and then stop: the hook of each video is its only chance.')
P('\n**Sample warning:** with fewer than about 100 engaged views per video, differences between videos are weak evidence. Use this report to choose experiments, not to declare winners.')
text = '\n'.join(L)
print(text)
if out: open(out, 'w').write(text + '\n')
