"""Exploration sheet for round 2 (black on white first, then colour). Usage: python3 explore.py <out.svg> [colour]"""
import sys
from geo import f, circ, svg
from marks import letters, o_centre, kancha, twin, mark_it, loop, hemisphere, R, CY

INK = "#111111"
colour = len(sys.argv) > 2
C = dict(ink="#16193B", blue="#2F6BEB", marigold="#FFB23F", green="#9BD18F", peach="#F6B08F", chalk="#F6F4EE")


def wordmark(swap=None, col=INK, x0=0):
    L, W = letters(x0)
    body = ""
    for n, d, x in L:
        if swap and n in swap:
            body += swap[n](x + R, CY)
        else:
            body += f'<path fill="{col}" d="{d}"/>'
    return body, W


def word_kancha(col=INK, vane=None):
    return wordmark({"o1": lambda cx, cy: kancha(cx, cy, 54, col if vane is None else C["blue"], vane)}, col)


def word_twin(col=INK, land=None, sea=None):
    def hemi(side):
        def draw(cx, cy):
            a, b = hemisphere(cx, cy, 54, side)
            if land is None:
                return f'<path fill="{col}" d="{a}{b}"/>'
            return f'<path fill="{land[0] if side < 0 else land[1]}" d="{a}"/><path fill="{sea}" d="{b}"/>'
        return draw
    return wordmark({"o1": hemi(-1), "o2": hemi(1)}, col)


def word_mark(col=INK, loop_col=None):
    body, W = wordmark(None, col)
    (x1, y), (x2, _) = o_centre("o1"), o_centre("o2")
    cx = (x1 + x2) / 2
    # loop around the "oo": scale the unit loop
    k = 1.42
    lp = f'<g transform="translate({f(cx)} {f(y)}) scale({k} {k*0.86}) translate(-128 -128)"><path fill="{loop_col or col}" d="{loop()}"/></g>'
    return body + lp, W


rows = []
y = 20
bg_dark = C["ink"]
# row 1: symbols large + small
syms = [kancha(), twin(), mark_it()] if not colour else [
    kancha(ink=C["blue"], vane=C["marigold"]), twin(land=(C["green"], C["peach"]), sea=C["blue"]),
    mark_it(loop_col=C["marigold"], dot=C["blue"])]
for i, s in enumerate(syms):
    x = 30 + i * 400
    rows.append(f'<g transform="translate({x} {y})">{s}</g>')
    rows.append(f'<g transform="translate({x+280} {y+40}) scale(0.125)">{s}</g>')
    rows.append(f'<g transform="translate({x+280} {y+100}) scale(0.0625)">{s}</g>')
    rows.append(f'<g transform="translate({x+280} {y+140}) scale(0.1875)">{s}</g>')
y += 300
# wordmarks
for build in ([lambda: wordmark(None, INK), lambda: word_kancha(), lambda: word_twin(), lambda: word_mark()] if not colour else
              [lambda: wordmark(None, C["ink"]), lambda: word_kancha(C["ink"], C["marigold"]),
               lambda: word_twin(C["ink"], (C["green"], C["peach"]), C["blue"]), lambda: word_mark(C["ink"], C["marigold"])]):
    body, W = build()
    k = 0.62
    rows.append(f'<g transform="translate(30 {y}) scale({k})">{body}</g>')
    k2 = 0.22
    rows.append(f'<g transform="translate(620 {y+30}) scale({k2})">{body}</g>')
    y += 175
H = y + 10
bg = "#ffffff"
open(sys.argv[1], "w").write(svg("".join(rows), 1220, H, "explore", bg=bg))
print(H)
