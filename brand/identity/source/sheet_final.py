"""Contact sheet of every asset in dist/ (for review). Usage: sheet_final.py out.svg"""
import sys, os, re
D = "../dist"
def body(p, pre):
    s = open(p).read(); i = s.index(">", s.index("<svg")) + 1
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', s).group(1).split()]
    return s[i:s.rindex("</svg>")].replace('id="', f'id="{pre}'), vb[2], vb[3], s
items, n = [], [0]
def place(p, x, y, w, h, bg=None):
    n[0] += 1
    b, vw, vh, raw = body(p, f"i{n[0]}")
    k = min(w / vw, h / vh)
    if bg: items.append(f'<rect x="{x-6}" y="{y-6}" width="{w+12}" height="{h+12}" rx="10" fill="{bg}"/>')
    if 'stroke-width="2"' in raw and vw == 24:
        items.append(f'<g transform="translate({x} {y}) scale({k})" fill="none" stroke="#12133A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{b}</g>')
    else:
        items.append(f'<g transform="translate({x} {y}) scale({k:.4f})">{b}</g>')
SP, CH = "#12133A", "#F7F5EF"
items.append(f'<rect width="1400" height="1500" fill="#E9E7E1"/>')
place(f"{D}/logo/bhoogol-wordmark-day.svg", 30, 30, 560, 170, CH)
place(f"{D}/logo/bhoogol-wordmark-night.svg", 640, 30, 560, 170, SP)
place(f"{D}/logo/bhoogol-wordmark-black.svg", 30, 230, 400, 120, "#fff")
place(f"{D}/logo/bhoogol-wordmark-white.svg", 470, 230, 400, 120, "#000")
place(f"{D}/logo/bhoogol-devanagari-day.svg", 920, 230, 220, 120, CH)
place(f"{D}/logo/bhoogol-devanagari-night.svg", 1160, 230, 200, 120, SP)
place(f"{D}/logo/bhoogol-bilingual-day.svg", 30, 390, 420, 260, CH)
place(f"{D}/logo/bhoogol-bilingual-night.svg", 490, 390, 420, 260, SP)
x = 950
for p, bg in (("bhoogol-symbol.svg", CH), ("bhoogol-symbol-black.svg", "#fff"), ("bhoogol-world.svg", SP), ("bhoogol-app-icon.svg", None)):
    place(f"{D}/logo/{p}", x, 400, 90, 90, bg); x += 110
x = 950
for s in (16, 24, 32, 48):
    place(f"{D}/logo/bhoogol-world.svg", x, 540, s, s, None); place(f"{D}/logo/bhoogol-app-icon.svg", x, 600, s, s, None); x += s + 24
x = 30
for k in ("circle", "underline", "arrow", "tick", "sparkle"):
    place(f"{D}/marks/marker-{k}.svg", x, 700, 150, 150, SP); x += 175
x = 30
for p in ("world-west", "world-east", "moon", "kancha-blue", "kancha-mint", "kancha-marigold"):
    place(f"{D}/worlds/{p}.svg", x, 900, 130, 130, SP); x += 150
place(f"{D}/worlds/pattern-confetti.svg", 940, 700, 330, 330)
x, y = 30, 1100
for i, nme in enumerate(sorted(os.listdir(f"{D}/icons"))):
    place(f"{D}/icons/{nme}", x, y, 48, 48, "#fff"); x += 76
    if x > 1300: x, y = 30, y + 80
open(sys.argv[1], "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1260" width="1400" height="1260">{"".join(items)}</svg>')
