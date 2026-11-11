import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
D = sys.argv[1]
W, H = 1080, 1920
F8, F7, F5 = D + '/heebo800.ttf', D + '/heebo700.ttf', D + '/heebo500.ttf'
GREEN = (31, 131, 72, 255); LIME = (115, 190, 67, 255); WHITE = (255, 255, 255, 255)
logo = Image.open(D + '/logo.png').convert('RGBA')
a = np.asarray(logo).copy(); a[..., 3] = np.where(a[..., 3] < 60, 0, a[..., 3]); logo = Image.fromarray(a, 'RGBA')

def shadowed(im, layer, blur=10, alpha=170):
    m = layer.split()[3].point(lambda v: v * alpha // 255)
    sh = Image.composite(Image.new('RGBA', im.size, (0, 0, 0, 255)), Image.new('RGBA', im.size, (0, 0, 0, 0)), m)
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur))); im.alpha_composite(layer)

def text(im, y, s, size, fill=WHITE, font=F8, blur=10):
    L = Image.new('RGBA', im.size, (0, 0, 0, 0))
    f = ImageFont.truetype(font, size); d = ImageDraw.Draw(L)
    while d.textlength(s, font=f, direction='rtl') > W - 100: size -= 2; f = ImageFont.truetype(font, size)
    d.text((W / 2, y), s, font=f, fill=fill, anchor='mm', direction='rtl'); shadowed(im, L, blur)

def put_logo(im, scale, cy):
    L = logo.resize((int(logo.width * scale), int(logo.height * scale)), Image.LANCZOS)
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0)); layer.paste(L, ((W - L.width) // 2, cy - L.height // 2), L)
    shadowed(im, layer, 12, 140)

def pill(im, s, cy, size=60):
    d = ImageDraw.Draw(im); f = ImageFont.truetype(F8, size)
    pw = d.textlength(s, font=f, direction='rtl') + 110; ph = size * 2.1; x0 = (W - pw) / 2; y0 = cy - ph / 2
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((x0, y0 + 8, x0 + pw, y0 + ph + 8), 32, fill=(0, 0, 0, 110))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))
    d = ImageDraw.Draw(im); d.rounded_rectangle((x0, y0, x0 + pw, y0 + ph), 32, fill=GREEN)
    d.text((W / 2, cy), s, font=f, fill=WHITE, anchor='mm', direction='rtl')

def headline(name, l1, l2=None, y=560, logo_on=True, accent=True, back=True):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    if logo_on: put_logo(im, 1.0, 215)
    if back:
        b = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ImageDraw.Draw(b).rounded_rectangle((60, y - 90, W - 60, y + (220 if l2 else 110)), 40, fill=(0, 0, 0, 120))
        im.alpha_composite(b.filter(ImageFilter.GaussianBlur(40)))
    text(im, y, l1, 96)
    if accent: ImageDraw.Draw(im).rounded_rectangle((W / 2 - 70, y + 72, W / 2 + 70, y + 80), 4, fill=LIME)
    if l2: text(im, y + 150, l2, 60, LIME, F7)
    im.save(f'{D}/{name}.png')

headline('h1', 'בית שנראה כמו כל בית.', None, 620, back=False)
headline('h2', 'אבל בנוי אחרת.', None, 620, back=False)
headline('h3', '8 שכבות של הגנה', 'מבחוץ ועד פנים', 420, logo_on=False)
headline('h4', 'שלד פלדה ובטון מותז', 'חזק ועמיד לאורך שנים', 1300)
headline('h5', 'מבודד וחזק', 'כל קיר נבנה בקפידה', 560)
headline('h9', 'נמדד מדויק', 'בכל קיר', 560)
headline('h6', 'גמר מוקפד', 'בית מוכן לחיים', 1300, logo_on=False)
headline('h7', 'ועד הפיתוח האחרון', 'מסביב לבית', 560)
headline('h8', 'הבית שלכם.', 'בונים אותו שכבה אחרי שכבה', 600, back=False)
im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
put_logo(im, 1.7, 640); text(im, 930, 'רוצים בית כזה?', 100)
pill(im, 'דברו איתנו', 1120, 64); im.save(f'{D}/cta.png')
print('ok')
