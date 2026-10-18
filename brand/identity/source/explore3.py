"""Round 2 · v3 exploration sheet. Usage: explore3.py out.svg"""
import sys
from geo import f, circ, svg
from marks import letters, o_centre, R, CY, kancha3, twin3, world, mark_it3, loop

C = dict(space="#12133A", blue="#2E6BFF", deep="#1E44C8", marigold="#FFB020", mint="#3DDC97",
         coral="#FF7A59", chalk="#F7F5EF", ink="#12133A")
SH = "rgba(10,12,40,0.28)"


def word(swap=None, col="#111"):
    body = ""
    L, W = letters(0)
    for n, d, x in L:
        body += swap[n](x + R, CY) if swap and n in swap else f'<path fill="{col}" d="{d}"/>'
    return body, W


def sym(i, mode):
    c = mode != "mono"
    if i == 0:
        return kancha3() if not c else kancha3(body=C["blue"], shade=C["deep"], vane=C["marigold"])
    if i == 1:
        return twin3() if not c else twin3(sea=C["blue"], lands=(C["mint"], C["marigold"]))
    if i == 2:
        return twin3() if not c else twin3(sea=C["blue"], lands=(C["mint"], C["marigold"]), shade=SH)
    return mark_it3() if not c else mark_it3(loop_col=C["marigold"], sea=C["blue"], land=C["mint"])


def word_variant(i, mode):
    c = mode != "mono"
    col = "#111" if not c else (C["chalk"] if mode == "dark" else C["ink"])
    if i == 0:
        return word({"o1": lambda cx, cy: kancha3(cx, cy, 54) if not c else kancha3(cx, cy, 54, body=C["blue"], shade=C["deep"], vane=C["marigold"])}, col)
    if i in (1, 2):
        def w(side, land):
            return lambda cx, cy: (world(cx, cy, 54, side, mono=col) if not c else
                                   world(cx, cy, 54, side, sea=C["blue"], land=land, shade=SH if i == 2 else None))
        return word({"o1": w(-1, C["mint"]), "o2": w(1, C["marigold"])}, col)
    body, W = word(None, col)
    (x1, y), (x2, _) = o_centre("o1"), o_centre("o2")
    lc = col if not c else C["marigold"]
    body += (f'<g transform="translate({f((x1+x2)/2)} {f(y)}) scale(1.36 1.12) translate(-128 -128)">'
             f'<path fill="{lc}" d="{loop(128, 128, rx=98, ry=90, tilt=-12, turns=1.18, wmax=19, start=160, n=40)}"/></g>')
    return body, W


rows, y, W = [], 0, 1640
for mode, bg in (("mono", "#ffffff"), ("dark", C["space"]), ("light", "#ffffff")):
    rows.append(f'<rect x="0" y="{y}" width="{W}" height="560" fill="{bg}"/>')
    for i in range(4):
        x = 24 + i * 404
        s = sym(i, mode)
        rows.append(f'<g transform="translate({x} {y+16}) scale(0.8)">{s}</g>')
        for k, (dx, dy) in ((48 / 256, (220, 30)), (32 / 256, (220, 96)), (16 / 256, (220, 146))):
            rows.append(f'<g transform="translate({x+dx} {y+dy}) scale({k:.4f})">{s}</g>')
        body, ww = word_variant(i, mode)
        rows.append(f'<g transform="translate({x} {y+250}) scale(0.46)">{body}</g>')
        rows.append(f'<g transform="translate({x} {y+390}) scale(0.22)">{body}</g>')
        rows.append(f'<g transform="translate({x} {y+470}) scale(0.11)">{body}</g>')
    y += 560
open(sys.argv[1], "w").write(svg("".join(rows), W, y, "explore v3"))
print(y)
