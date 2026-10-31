from PIL import Image, ImageDraw, ImageFont, ImageFilter
import sys
W, H = 1080, 1920
D = sys.argv[1]
F8 = D + '/heebo800.ttf'
F7 = D + '/heebo700.ttf'

LAYERS = ['חיפוי חוץ', 'טיח', 'בטון', 'פלדה', 'בידוד', 'עץ', 'גבס', 'צבע']
TITLES = ['1. חיפוי חוץ', '2. טיח', '3. בטון ורשת ברזל', '4. שלד פלדה',
          '5. בידוד', '6. שכבת עץ', '7. לוח גבס מבפנים', '8. צבע']
FINAL = '8 שכבות. בית אחד.'

PILL = (31, 131, 72, 255)
ACTIVE = (115, 190, 67, 255)
DONE = (21, 125, 60, 255)
PEND = (60, 64, 70, 200)
WHITE = (255, 255, 255, 255)
SHADOW = (0, 0, 0, 150)


def text_shadow(d, xy, s, font, fill, anchor):
    x, y = xy
    d.text((x + 2, y + 2), s, font=font, fill=SHADOW, anchor=anchor, direction='rtl')
    d.text((x, y), s, font=font, fill=fill, anchor=anchor, direction='rtl')


def overlay(active, title):
    """active: index of current layer (0..7), or 8 = all done (final)."""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # pill
    f = ImageFont.truetype(F8, 64)
    tw = d.textlength(title, font=f, direction='rtl')
    pw = tw + 110
    x0 = (W - pw) / 2
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((x0, 1198, x0 + pw, 1338), 30, fill=(0, 0, 0, 110))
    im = Image.alpha_composite(im, sh.filter(ImageFilter.GaussianBlur(10)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((x0, 1190, x0 + pw, 1330), 30, fill=PILL)
    d.text((W / 2, 1260), title, font=f, fill=WHITE, anchor='mm', direction='rtl')
    # outside / inside labels
    fs = ImageFont.truetype(F7, 26)
    text_shadow(d, (1000, 1412), 'חוץ', fs, WHITE, 'rm')
    text_shadow(d, (80, 1412), 'פנים', fs, WHITE, 'lm')
    # bars: rightmost = outside (layer 0)
    n, gap, left, right = 8, 8, 80, 1000
    bw = (right - left - gap * (n - 1)) / n
    fl = ImageFont.truetype(F7, 25)
    for i, name in enumerate(LAYERS):
        bx1 = right - i * (bw + gap)
        bx0 = bx1 - bw
        if active >= 8:
            col = ACTIVE
        elif i < active:
            col = DONE
        elif i == active:
            col = ACTIVE
        else:
            col = PEND
        d.rounded_rectangle((bx0, 1440, bx1, 1518), 12, fill=col)
        size = 25
        while d.textlength(name, font=fl, direction='rtl') > bw + 6 and size > 18:
            size -= 1
            fl = ImageFont.truetype(F7, size)
        bold = i <= active
        text_shadow(d, ((bx0 + bx1) / 2, 1556), name, fl,
                    WHITE if bold else (225, 225, 225, 255), 'mm')
        fl = ImageFont.truetype(F7, 25)
    return im


def band_mask():
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).rectangle((0, 1175, W, 1600), fill=255)
    return m.filter(ImageFilter.GaussianBlur(18))


def intro_overlay():
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(F8, 44)
    s = '8 שכבות'
    for dx in range(-3, 4):
        for dy in range(-3, 4):
            if dx * dx + dy * dy <= 9:
                d.text((540 + dx, 458 + dy), s, font=f, fill=(20, 40, 25, 255), anchor='mm', direction='rtl')
    d.text((540, 458), s, font=f, fill=(115, 189, 73, 255), anchor='mm', direction='rtl')
    return im


def intro_mask():
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle((440, 418, 640, 500), 20, fill=255)
    return m.filter(ImageFilter.GaussianBlur(10))


for i, t in enumerate(TITLES):
    overlay(i, t).save(f'{D}/ov{i}.png')
overlay(8, FINAL).save(f'{D}/ov8.png')
band_mask().save(f'{D}/band_mask.png')
intro_overlay().save(f'{D}/intro_ov.png')
intro_mask().save(f'{D}/intro_mask.png')
print('ok')
