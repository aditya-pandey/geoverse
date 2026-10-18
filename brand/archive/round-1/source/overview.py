"""Builds overview.svg: every concept, lockup and icon size on one sheet (render it to overview.png)."""
import sys
B = sys.argv[1]
NAVY = "#06080D"


def body(p, pre):
    s = open(f"{B}/{p}").read(); i = s.index(">", s.index("<svg")) + 1
    vb = [float(v) for v in s.split('viewBox="')[1].split('"')[0].split()]
    return s[i:s.rindex("</svg>")].replace('id="', f'id="{pre}'), vb[2], vb[3]


items, y, W = [], 0, 1200
def band(h, bg, label, dark):
    global y
    items.append(f'<rect x="0" y="{y}" width="{W}" height="{h}" fill="{bg}"/>'
                 f'<text x="20" y="{y+26}" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="{"#8a94a8" if dark else "#6b7280"}">{label}</text>')
    y0 = y; y += h; return y0

n = 0
def place(p, x, yy, w=None, h=None):
    global n; n += 1
    b, vw, vh = body(p, f"i{n}")
    k = min((w or 1e9) / vw, (h or 1e9) / vh)
    items.append(f'<g transform="translate({x} {yy}) scale({k:.4f})">{b}</g>')
    return vw * k

for label, files, bg, dark in (
    ("Concepts, one colour", ["concepts/a-patchwork.svg", "concepts/b-pale-blue-dot.svg", "concepts/c-tilt.svg"], "#ffffff", False),
    ("Colour proposals on the app's navy", ["concepts/a-patchwork-colour.svg", "concepts/b-pale-blue-dot-colour.svg", "concepts/c-tilt-colour.svg"], NAVY, True),
    ("Colour proposals on white", ["concepts/a-patchwork-colour.svg", "concepts/b-pale-blue-dot-colour.svg", "concepts/c-tilt-colour.svg"], "#ffffff", False)):
    y0 = band(250, bg, label, dark)
    for i, p in enumerate(files):
        x = 40 + i * 390
        place(p, x, y0 + 44, 180, 180)
        place(p, x + 210, y0 + 120, 32, 32)
        place(p, x + 260, y0 + 128, 16, 16)
names = ["A  Patchwork", "B  Pale Blue Dot (recommended)", "C  Tilt"]
items.append("".join(f'<text x="{40+i*390}" y="{y+22}" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="bold" fill="#111">{t}</text>' for i, t in enumerate(names)))
band(36, "#f1f3f6", "", False)
items.pop(); items.append(items.pop() if False else "")

for label, p, bg, dark, h in (
    ("Horizontal lockup, on light", "master/bhoogol-horizontal-on-light.svg", "#ffffff", False, 150),
    ("Horizontal lockup, on the app's navy", "master/bhoogol-horizontal-on-dark.svg", NAVY, True, 150),
    ("Bilingual lockup, on light", "master/bhoogol-bilingual-on-light.svg", "#ffffff", False, 230),
    ("Bilingual lockup, on the app's navy", "master/bhoogol-bilingual-on-dark.svg", NAVY, True, 230),
    ("One colour", "master/bhoogol-horizontal-black.svg", "#ffffff", False, 150)):
    y0 = band(h, bg, label, dark)
    place(p, 30, y0 + 36, 600, h - 50)
    if "bilingual-on-light" in p:
        place("master/bhoogol-devanagari-navy.svg", 700, y0 + 40, 420, 170)
    if "bilingual-on-dark" in p:
        place("master/bhoogol-devanagari-peach.svg", 700, y0 + 40, 420, 170)
    if "black" in p:
        place("master/bhoogol-horizontal-white.svg", 650, y0 + 36, 520, h - 50)
        items.insert(len(items) - 1, f'<rect x="640" y="{y0+30}" width="540" height="{h-40}" fill="{NAVY}"/>')

y0 = band(150, "#eef1f5", "App icon, favicon (small drawing) and main symbol at 16, 24, 32, 48 px", False)
x = 30
place("web/bhoogol-app-icon.svg", x, y0 + 40, 96, 96); x += 140
for s in (16, 24, 32, 48):
    place("master/bhoogol-symbol-small.svg", x, y0 + 90 - s / 2, s, s); x += s + 26
x += 40
for s in (16, 24, 32, 48):
    place("master/bhoogol-symbol.svg", x, y0 + 90 - s / 2, s, s); x += s + 26

open(sys.argv[2], "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {int(y)}" width="{W}" height="{int(y)}">' + "".join(items) + "</svg>")
print(int(y))
