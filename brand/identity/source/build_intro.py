"""Writes the opening sequence's artwork into GeoVerse/index.html (between the intro markers).

The opening is built from the logo itself, so the moment it docks into the top bar it is pixel-identical
to assets/brand/bhoogol-wordmark-night.svg:
  · .intro-word   — the wordmark, one <g class="ltr"> per letter (they pop in), plus static worlds
                    (hidden until the dock) in the "oo";
  · .intro-world  — two spinning worlds laid exactly over the "oo": a circle of ocean with a strip of
                    land that slides past (Americas, then Afro-Eurasia, …), so each reads as a turning globe;
Run from this folder:  python3 build_intro.py
"""
import re
from geo import f, circ
from marks import letters, R, CY
import final_marks as F

INDEX = "../../../index.html"
PAD, TOP = 24, F.WM_TOP                       # same framing as wordmark_svg()
L, WM_W = letters(0)
VBW, VBH = WM_W + 2 * PAD, F.WM_BOTTOM - F.WM_TOP + 2 * PAD
OX, OY = PAD, PAD - TOP                       # letters' offset inside the viewBox
HALF = 120                                    # spacing between continents on the spinning strip (units)

parts = []
i = 0
worlds = []
for n, d, x in L:
    if n in ("o1", "o2"):
        side = -1 if n == "o1" else 1
        worlds.append((side, x + R + OX, CY + OY))
        parts.append(f'<g class="stat-world">{F.world(x + R + OX, CY + OY, 54, side)}</g>')
    else:
        parts.append(f'<g class="ltr" style="--i:{i}"><path fill="#F7F5EF" transform="translate({OX} {OY})" d="{d}"/></g>')
        i += 1
word = (f'<svg class="intro-word" viewBox="0 0 {f(VBW)} {f(VBH)}" aria-hidden="true">' + "".join(parts) + "</svg>")


def spinner(side, cx, cy):
    tag = "l" if side < 0 else "r"
    ground = F.MINT if side < 0 else F.MARIGOLD
    strip = "".join(f'<path d="{F.land(k * HALF, 0, 54, -1 if k % 2 == 0 else 1)}"/>' for k in range(5))
    pos = (f"left:{(cx - 54) / VBW * 100:.3f}%;top:{(cy - 54) / VBH * 100:.3f}%;"
           f"width:{108 / VBW * 100:.3f}%;height:{108 / VBH * 100:.3f}%")
    return (f'<svg class="intro-world {tag}" viewBox="-54 -54 108 108" style="{pos}" aria-hidden="true">'
            f'<defs><clipPath id="iw-{tag}"><circle r="54"/></clipPath></defs>'
            f'<circle r="54" fill="{F.BLUE}"/>'
            f'<g clip-path="url(#iw-{tag})"><g class="strip" fill="{ground}">{strip}</g></g>'
            f'<path class="shade" fill="{F.SPACE}" fill-opacity="0.3" d="{F.night(0, 0, 54)}"/></svg>')


spin = "".join(spinner(*w) for w in worlds)
markup = f'<div class="intro-mark">{word}{spin}</div>'
s = open(INDEX).read()
s, n = re.subn(r"<!-- intro:start -->.*?<!-- intro:end -->", f"<!-- intro:start -->{markup}<!-- intro:end -->", s, flags=re.S)
assert n == 1, "intro markers not found in index.html"
open(INDEX, "w").write(s)
print(f"intro artwork written ({len(markup) // 1024} KB), viewBox {VBW:.0f}×{VBH:.0f}, worlds at {[(round(x), round(y)) for _, x, y in worlds]}")
