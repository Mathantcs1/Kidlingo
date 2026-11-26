#!/usr/bin/env python3
"""Two A/B faceless thumbnails (1280x720). Needs Fredoka + Kalam in ~/.fonts (Google Fonts, OFL). Fredoka axes are [weight, width].
usage: python3 make_thumbnails.py out_dir "HEADLINE A" "BIG A" "chip A" "HEADLINE B" "BIG B" "chip B" """
import glob, os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
out = sys.argv[1]; os.makedirs(out, exist_ok=True); FB = glob.glob(os.path.expanduser('~/.fonts/Fredoka*'))[0]; FH = os.path.expanduser('~/.fonts/Kalam-Bold.ttf')
def big(size, w=700): f = ImageFont.truetype(FB, size); f.set_variation_by_axes([w, 100]); return f
def bg():
    im = Image.new('RGB', (1280, 720)); d = ImageDraw.Draw(im)
    for y in range(720): d.line([(0, y), (1280, y)], fill=(11 + int(14 * y / 720), 18 + int(16 * y / 720), 48 + int(40 * y / 720)))
    g = Image.new('RGB', (1280, 720)); gd = ImageDraw.Draw(g); gd.ellipse([-200, -250, 700, 500], fill=(115, 87, 245)); gd.ellipse([700, 300, 1500, 950], fill=(54, 124, 245)); return Image.blend(im, g.filter(ImageFilter.GaussianBlur(160)), 0.38)
def fit(d, s, size, maxw):
    while d.textlength(s, font=big(size)) > maxw: size -= 4
    return big(size)
for tag, (head, bigt, chip), col in (('A', sys.argv[2:5], (22, 184, 176)), ('B', sys.argv[5:8], (255, 176, 46))):
    im = bg(); d = ImageDraw.Draw(im); st = dict(anchor='mm', stroke_width=10, stroke_fill=(8, 10, 30))
    d.text((640, 140), head, font=fit(d, head, 100, 1100), fill=(238, 241, 251), **st); d.text((640, 380), bigt, font=fit(d, bigt, 300, 1100), fill=(255, 210, 31), **st)
    d.rounded_rectangle([280, 555, 1000, 655], radius=50, fill=col); d.text((640, 605), chip, font=ImageFont.truetype(FH, 62), fill=(8, 10, 30), anchor='mm'); im.save(f'{out}/thumbnail_{tag}.png')
print('thumbnails ->', out)
