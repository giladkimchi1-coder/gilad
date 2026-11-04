import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

D, FONTS = sys.argv[1], sys.argv[2]
W, H = 1080, 1920
F8, F7 = FONTS + '/heebo800.ttf', FONTS + '/heebo700.ttf'
GREEN = (31, 131, 72, 255)
LIME = (115, 190, 67, 255)

logo = Image.open(D + '/logo.png').convert('RGBA')
a = np.asarray(logo).copy()
a[..., 3] = np.where(a[..., 3] < 60, 0, a[..., 3])  # drop faint cloud residue
logo = Image.fromarray(a, 'RGBA')


def with_shadow(base, layer, blur=14, alpha=120):
    sh = Image.new('RGBA', base.size, (0, 0, 0, 0))
    m = layer.split()[3].point(lambda v: v * alpha // 255)
    sh.putalpha(m)
    sh = Image.composite(Image.new('RGBA', base.size, (0, 0, 0, 255)), Image.new('RGBA', base.size, (0, 0, 0, 0)), m)
    base.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))
    base.alpha_composite(layer)


def place_logo(im, scale, cy):
    L = logo.resize((int(logo.width * scale), int(logo.height * scale)), Image.LANCZOS)
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
    layer.paste(L, ((W - L.width) // 2, cy - L.height // 2), L)
    with_shadow(im, layer, 12, 140)


def pill(im, text, cy, size=64, fill=GREEN, color=(255, 255, 255, 255)):
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(F8, size)
    tw = d.textlength(text, font=f, direction='rtl')
    pw, ph = tw + 110, size * 2.1
    x0, y0 = (W - pw) / 2, cy - ph / 2
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((x0, y0 + 8, x0 + pw, y0 + ph + 8), 30, fill=(0, 0, 0, 110))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((x0, y0, x0 + pw, y0 + ph), 30, fill=fill)
    d.text((W / 2, cy), text, font=f, fill=color, anchor='mm', direction='rtl')


def shadow_text(im, xy, text, font, fill, anchor='mm'):
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).text(xy, text, font=font, fill=fill, anchor=anchor, direction='rtl')
    with_shadow(im, layer, 8, 170)


def step(i, n, title, out, logo_on=True):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    if logo_on:
        place_logo(im, 1.0, 215)
    pill(im, title, 1480)
    # progress dots
    r, gap = 9, 34
    x0 = W / 2 + (n - 1) * gap / 2
    d = ImageDraw.Draw(im)
    for k in range(n):
        x = x0 - k * gap
        d.ellipse((x - r, 1600 - r, x + r, 1600 + r),
                  fill=LIME if k == i else (255, 255, 255, 150))
    im.save(out)


def intro(out, title, sub):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    place_logo(im, 1.45, 560)
    shadow_text(im, (W / 2, 860), title, ImageFont.truetype(F8, 104), (255, 255, 255, 255))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((W / 2 - 70, 950, W / 2 + 70, 958), 4, fill=LIME)
    if sub:
        shadow_text(im, (W / 2, 1030), sub, ImageFont.truetype(F7, 52), LIME)
    im.save(out)


def outro(out, line):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    place_logo(im, 1.6, 780)
    pill(im, line, 1040, size=60)
    im.save(out)


if __name__ == '__main__':
    steps = sys.argv[3].split('|')
    for i, t in enumerate(steps):
        step(i, len(steps), t, f'{D}/st{i}.png')
        step(i, len(steps), t, f'{D}/st{i}_nl.png', logo_on=False)
    intro(f'{D}/intro.png', 'עדכון מהשטח', sys.argv[4] if len(sys.argv) > 4 else '')
    outro(f'{D}/outro.png', 'בונים שכבה אחרי שכבה.')
    print('ok')
