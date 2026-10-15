# Draws the flair sprite sheet (public/images/flair.png, 16x16 cells) and server/flairs.json.
# Every icon is drawn here from simple shapes, at 8x size and scaled down for smooth edges.
#   python3 tools/make-flairs.py
import json, math, os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 8            # supersampling
C = 16 * S       # cell size while drawing
COLS = 8

def poly_star(cx, cy, r_out, r_in, n, rot=-90):
    pts = []
    for i in range(n * 2):
        r = r_out if i % 2 == 0 else r_in
        a = math.radians(rot + i * 180 / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

def outline(d, shape, *args, fill, line=(20, 20, 20, 255), w=S):
    getattr(d, shape)(*args, fill=fill, outline=line, width=w)

def star(d, col):
    outline(d, 'polygon', poly_star(C / 2, C / 2 + S / 2, C * .47, C * .2, 5), fill=col)

def heart(d, col):
    r = C * .22
    d.ellipse([C * .08, C * .14, C * .08 + 2 * r, C * .14 + 2 * r], fill=col)
    d.ellipse([C * .92 - 2 * r, C * .14, C * .92, C * .14 + 2 * r], fill=col)
    d.polygon([(C * .1, C * .42), (C * .9, C * .42), (C * .5, C * .9)], fill=col)

def crown(d, col):
    outline(d, 'polygon', [(C * .08, C * .8), (C * .08, C * .3), (C * .3, C * .55), (C * .5, C * .18), (C * .7, C * .55), (C * .92, C * .3), (C * .92, C * .8)], fill=col)
    for x in (.08, .5, .92):
        d.ellipse([C * x - S * 1.5, C * (.3 if x != .5 else .18) - S * 1.5, C * x + S * 1.5, C * (.3 if x != .5 else .18) + S * 1.5], fill=(230, 60, 60, 255))

def diamond(d, col):
    outline(d, 'polygon', [(C * .5, C * .06), (C * .9, C * .4), (C * .5, C * .94), (C * .1, C * .4)], fill=col)
    d.line([(C * .1, C * .4), (C * .9, C * .4)], fill=(255, 255, 255, 140), width=S)

def moon(d, col):
    d.ellipse([C * .1, C * .1, C * .9, C * .9], fill=col)
    d.ellipse([C * .32, C * .02, C * 1.05, C * .75], fill=(0, 0, 0, 0))

def sun(d, col):
    for i in range(8):
        a = math.radians(i * 45)
        d.line([(C / 2 + math.cos(a) * C * .2, C / 2 + math.sin(a) * C * .2), (C / 2 + math.cos(a) * C * .47, C / 2 + math.sin(a) * C * .47)], fill=col, width=int(S * 1.6))
    outline(d, 'ellipse', [C * .27, C * .27, C * .73, C * .73], fill=col)

def bolt(d, col):
    outline(d, 'polygon', [(C * .58, C * .04), (C * .18, C * .56), (C * .46, C * .56), (C * .36, C * .96), (C * .82, C * .4), (C * .53, C * .4)], fill=col)

def flame(d, col):
    d.ellipse([C * .2, C * .38, C * .8, C * .95], fill=col)
    d.polygon([(C * .22, C * .62), (C * .5, C * .02), (C * .78, C * .62)], fill=col)
    d.ellipse([C * .36, C * .6, C * .64, C * .9], fill=(255, 230, 120, 255))

def leaf(d, col):
    pts = []
    for i in range(41):  # a lens from bottom-left to top-right
        t = i / 40
        bulge = math.sin(t * math.pi) * .3
        pts.append((C * (.1 + .8 * t - bulge * .7), C * (.9 - .8 * t - bulge * .7)))
    for i in range(41):
        t = 1 - i / 40
        bulge = math.sin(t * math.pi) * .3
        pts.append((C * (.1 + .8 * t + bulge * .7), C * (.9 - .8 * t + bulge * .7)))
    d.polygon(pts, fill=col)
    d.line([(C * .1, C * .9), (C * .85, C * .15)], fill=(40, 90, 30, 255), width=S)

def drop(d, col):
    d.ellipse([C * .2, C * .38, C * .8, C * .95], fill=col)
    d.polygon([(C * .22, C * .6), (C * .5, C * .04), (C * .78, C * .6)], fill=col)

def snow(d, col):
    for i in range(3):
        a = math.radians(i * 60)
        dx, dy = math.cos(a) * C * .44, math.sin(a) * C * .44
        d.line([(C / 2 - dx, C / 2 - dy), (C / 2 + dx, C / 2 + dy)], fill=col, width=int(S * 1.6))
    d.ellipse([C * .4, C * .4, C * .6, C * .6], fill=col)

def clover(d, col):
    r = C * .2
    for cx, cy in ((.5, .28), (.28, .5), (.72, .5), (.5, .72)):
        d.ellipse([C * cx - r, C * cy - r, C * cx + r, C * cy + r], fill=col)

def note(d, col):
    d.ellipse([C * .12, C * .62, C * .44, C * .9], fill=col)
    d.ellipse([C * .56, C * .52, C * .88, C * .8], fill=col)
    d.rectangle([C * .36, C * .14, C * .44, C * .76], fill=col)
    d.rectangle([C * .8, C * .06, C * .88, C * .66], fill=col)
    d.polygon([(C * .36, C * .14), (C * .88, C * .06), (C * .88, C * .2), (C * .36, C * .28)], fill=col)

def ball(d, col):
    outline(d, 'ellipse', [C * .1, C * .1, C * .9, C * .9], fill=col)
    d.ellipse([C * .26, C * .22, C * .44, C * .4], fill=(255, 255, 255, 200))

def egg(d, col):
    outline(d, 'ellipse', [C * .2, C * .06, C * .8, C * .94], fill=col)
    d.line([(C * .22, C * .5), (C * .35, C * .4), (C * .5, C * .5), (C * .65, C * .4), (C * .78, C * .5)], fill=(255, 255, 255, 220), width=S)

def pumpkin(d, col):
    for x0 in (.06, .24, .42):
        d.ellipse([C * x0, C * .22, C * (x0 + .52), C * .92], fill=col, outline=(120, 50, 0, 255), width=S // 2)
    d.rectangle([C * .44, C * .06, C * .56, C * .26], fill=(60, 120, 40, 255))

def ghost(d, col):
    d.ellipse([C * .16, C * .06, C * .84, C * .66], fill=col)
    d.rectangle([C * .16, C * .36, C * .84, C * .82], fill=col)
    for i in range(3):
        x = .16 + i * .2267
        d.polygon([(C * x, C * .82), (C * (x + .2267), C * .82), (C * (x + .113), C * .96)], fill=col)
    for x in (.36, .64):
        d.ellipse([C * x - S * 1.4, C * .36 - S * 1.8, C * x + S * 1.4, C * .36 + S * 1.8], fill=(30, 30, 30, 255))

def tree(d, col):
    for y0, w in ((.05, .26), (.28, .36), (.5, .44)):
        d.polygon([(C * .5, C * y0), (C * (.5 + w), C * (y0 + .32)), (C * (.5 - w), C * (y0 + .32))], fill=col)
    d.rectangle([C * .42, C * .8, C * .58, C * .96], fill=(110, 70, 30, 255))

def deer(d, col):
    # head, ears and antlers
    d.ellipse([C * .3, C * .4, C * .7, C * .94], fill=col)
    d.polygon([(C * .3, C * .5), (C * .06, C * .4), (C * .26, C * .62)], fill=col)
    d.polygon([(C * .7, C * .5), (C * .94, C * .4), (C * .74, C * .62)], fill=col)
    ant = (110, 70, 30, 255)
    for sx in (-1, 1):
        x = .5 + sx * .1
        d.line([(C * x, C * .44), (C * (x + sx * .14), C * .06)], fill=ant, width=S)
        d.line([(C * (x + sx * .07), C * .25), (C * (x + sx * .28), C * .16)], fill=ant, width=S)
    d.ellipse([C * .44, C * .8, C * .56, C * .92], fill=(30, 30, 30, 255))

def anchor(d, col):
    w = int(S * 1.6)
    d.ellipse([C * .38, C * .04, C * .62, C * .26], outline=col, width=w)
    d.line([(C * .5, C * .26), (C * .5, C * .92)], fill=col, width=w)
    d.line([(C * .28, C * .36), (C * .72, C * .36)], fill=col, width=w)
    d.arc([C * .12, C * .44, C * .88, C * .94], 20, 160, fill=col, width=w)

def shield(d, col):
    outline(d, 'polygon', [(C * .12, C * .1), (C * .88, C * .1), (C * .88, C * .5), (C * .5, C * .94), (C * .12, C * .5)], fill=col)
    d.polygon([(C * .5, C * .1), (C * .88, C * .1), (C * .88, C * .5), (C * .5, C * .94)], fill=(255, 255, 255, 60))

def trophy(d, col):
    d.pieslice([C * .2, C * -.1, C * .8, C * .62], 0, 180, fill=col)
    d.rectangle([C * .45, C * .5, C * .55, C * .76], fill=col)
    d.rectangle([C * .28, C * .76, C * .72, C * .9], fill=col)
    d.arc([C * .04, C * .2, C * .32, C * .5], 90, 270, fill=col, width=S)
    d.arc([C * .68, C * .2, C * .96, C * .5], 270, 90, fill=col, width=S)

def medal(d, col):
    d.polygon([(C * .25, C * .02), (C * .45, C * .02), (C * .6, C * .4), (C * .4, C * .4)], fill=(60, 110, 220, 255))
    d.polygon([(C * .55, C * .02), (C * .75, C * .02), (C * .6, C * .4), (C * .4, C * .4)], fill=(220, 60, 60, 255))
    outline(d, 'ellipse', [C * .22, C * .38, C * .78, C * .94], fill=col)

def flag(d, col):
    d.rectangle([C * .14, C * .06, C * .22, C * .96], fill=(60, 60, 60, 255))
    d.polygon([(C * .22, C * .08), (C * .9, C * .26), (C * .22, C * .5)], fill=col)

def planet(d, col):
    d.ellipse([C * .22, C * .22, C * .78, C * .78], fill=col)
    d.arc([C * .02, C * .38, C * .98, C * .66], -10, 190, fill=(240, 220, 160, 255), width=S)

def bomb(d, col):
    d.ellipse([C * .1, C * .26, C * .82, C * .96], fill=col)
    d.line([(C * .6, C * .3), (C * .76, C * .1)], fill=(140, 110, 70, 255), width=S)
    d.ellipse([C * .72, C * .02, C * .92, C * .2], fill=(255, 190, 40, 255))

def cherry(d, col):
    d.line([(C * .3, C * .6), (C * .62, C * .08)], fill=(60, 120, 40, 255), width=S)
    d.line([(C * .7, C * .56), (C * .62, C * .08)], fill=(60, 120, 40, 255), width=S)
    d.ellipse([C * .08, C * .5, C * .48, C * .9], fill=col)
    d.ellipse([C * .5, C * .46, C * .9, C * .86], fill=col)

def cube(d, col):
    r, g, b, a = col
    d.polygon([(C * .5, C * .08), (C * .9, C * .28), (C * .5, C * .48), (C * .1, C * .28)], fill=(min(255, r + 50), min(255, g + 50), min(255, b + 50), a))
    d.polygon([(C * .1, C * .28), (C * .5, C * .48), (C * .5, C * .92), (C * .1, C * .72)], fill=col)
    d.polygon([(C * .9, C * .28), (C * .5, C * .48), (C * .5, C * .92), (C * .9, C * .72)], fill=(r // 2, g // 2, b // 2, a))

def ring(d, col):
    d.ellipse([C * .1, C * .1, C * .9, C * .9], outline=col, width=int(S * 2.5))

def plus(d, col):
    d.rectangle([C * .38, C * .08, C * .62, C * .92], fill=col)
    d.rectangle([C * .08, C * .38, C * .92, C * .62], fill=col)

def degree(n):
    def draw(d, col):
        outline(d, 'ellipse', [C * .04, C * .04, C * .96, C * .96], fill=col)
        d.text((C * .5, C * .52), str(n), fill=(255, 255, 255, 255), anchor='mm', font_size=C * (.55 if n < 100 else .4))
    return draw

RED, BLUE, GOLD, SILVER, BRONZE = (225, 60, 60, 255), (70, 120, 230, 255), (240, 190, 40, 255), (190, 195, 205, 255), (190, 120, 60, 255)
GREEN, PURPLE, ORANGE, PINK, WHITE, TEAL = (80, 190, 80, 255), (150, 90, 210, 255), (245, 140, 30, 255), (240, 120, 180, 255), (240, 240, 245, 255), (40, 180, 170, 255)
BROWN = (160, 105, 60, 255)

# (key, description, extra, category, draw, colour)
FLAIRS = [
    ('special.deer', 'Deer', 'The BambiPro mascot.', 'special', deer, BROWN),
    ('special.star', 'Star', 'Shine bright.', 'special', star, GOLD),
    ('special.heart', 'Heart', 'Good sport.', 'special', heart, RED),
    ('special.crown', 'Crown', 'Royalty.', 'special', crown, GOLD),
    ('special.diamond', 'Diamond', 'Unbreakable.', 'special', diamond, (110, 210, 240, 255)),
    ('special.trophy', 'Trophy', 'Winner winner.', 'special', trophy, GOLD),
    ('special.medal', 'Medal', 'Decorated.', 'special', medal, GOLD),
    ('special.shield', 'Shield', 'Defender.', 'special', shield, BLUE),
    ('special.anchor', 'Anchor', 'Holds the fort.', 'special', anchor, (90, 110, 140, 255)),
    ('special.bolt', 'Lightning', 'Fast hands.', 'special', bolt, (255, 220, 40, 255)),
    ('special.flame', 'Flame', 'On fire.', 'special', flame, ORANGE),
    ('special.snow', 'Snowflake', 'Ice cold.', 'special', snow, (180, 220, 255, 255)),
    ('special.moon', 'Moon', 'Night owl.', 'special', moon, (240, 230, 160, 255)),
    ('special.sun', 'Sun', 'Early bird.', 'special', sun, (255, 200, 40, 255)),
    ('special.planet', 'Planet', 'Out of this world.', 'special', planet, PURPLE),
    ('special.leaf', 'Leaf', 'Fresh.', 'special', leaf, GREEN),
    ('special.clover', 'Clover', 'Lucky.', 'special', clover, GREEN),
    ('special.cherry', 'Cherries', 'Sweet.', 'special', cherry, RED),
    ('special.drop', 'Drop', 'Cool and calm.', 'special', drop, (60, 160, 240, 255)),
    ('special.note', 'Music Note', 'Plays with the music on.', 'special', note, PINK),
    ('special.cube', 'Cube', 'Square deal.', 'special', cube, TEAL),
    ('special.ring', 'Ring', 'Goes around.', 'special', ring, SILVER),
    ('special.plus', 'Plus', 'Adds up.', 'special', plus, WHITE),
    ('special.bomb', 'Bomb', 'Handle with care.', 'special', bomb, (50, 50, 60, 255)),
    ('special.flag', 'Flag', 'Capture it.', 'special', flag, RED),
    ('special.ballred', 'Red Ball', 'Team red.', 'special', ball, RED),
    ('special.ballblue', 'Blue Ball', 'Team blue.', 'special', ball, BLUE),
    ('event.egg', 'Egg', 'Eggball.', 'event', egg, (250, 240, 220, 255)),
    ('event.pumpkin', 'Pumpkin', 'Spooky season.', 'event', pumpkin, ORANGE),
    ('event.ghost', 'Ghost', 'Boo.', 'event', ghost, WHITE),
    ('event.tree', 'Pine Tree', 'Winter games.', 'event', tree, (40, 140, 70, 255)),
    ('ranked.bronze', 'Bronze', 'Eggball Ranked.', 'ranked', medal, BRONZE),
    ('ranked.silver', 'Silver', 'Eggball Ranked.', 'ranked', medal, SILVER),
    ('ranked.gold', 'Gold', 'Eggball Ranked.', 'ranked', medal, GOLD),
] + [('degree.%d' % n, '%d Degrees' % n, 'Play Now wins.', 'degree', degree(n), c)
     for n, c in ((10, BRONZE), (50, SILVER), (100, GOLD), (180, PURPLE), (360, RED))]

rows = (len(FLAIRS) + COLS - 1) // COLS
sheet = Image.new('RGBA', (COLS * 16, rows * 16), (0, 0, 0, 0))
out = []
for i, (key, desc, extra, cat, draw, col) in enumerate(FLAIRS):
    cell = Image.new('RGBA', (C, C), (0, 0, 0, 0))
    draw(ImageDraw.Draw(cell), col)
    x, y = i % COLS, i // COLS
    sheet.paste(cell.resize((16, 16), Image.LANCZOS), (x * 16, y * 16))
    out.append({'category': cat, 'name': key.split('.')[1], 'x': x, 'y': y, 'description': desc, 'extra': extra, 'key': key, 'className': key.replace('.', '-')})
sheet.save(os.path.join(ROOT, 'public', 'images', 'flair.png'))
with open(os.path.join(ROOT, 'server', 'flairs.json'), 'w') as f:
    json.dump(out, f, indent=1)
print(len(out), 'flairs')
