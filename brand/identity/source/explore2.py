"""Round 2 · v2 exploration: mono row, colour on dark, colour on light, wordmarks. Usage: explore2.py out.svg"""
import sys
from geo import f, circ, svg
from marks import letters, o_centre, R, CY, kancha2, twin2, mark_it2, hemi2, loop2

C = dict(space="#12133A", blue="#2E6BFF", night="#1C3BB8", marigold="#FFB020", mint="#3DDC97",
         coral="#FF7A59", chalk="#F7F5EF", ink="#12133A")


def word(swap=None, col="#111"):
    body = ""
    L, W = letters(0)
    for n, d, x in L:
        body += swap[n](x + R, CY) if swap and n in swap else f'<path fill="{col}" d="{d}"/>'
    return body, W


def sym(i, mode, Rk=1.0):
    if i == 0:
        return kancha2() if mode == "mono" else kancha2(body=C["blue"], night=C["night"], vane=C["marigold"])
    if i == 1:
        return twin2() if mode == "mono" else twin2(sea=C["blue"], land=(C["mint"], C["coral"]))
    return mark_it2() if mode == "mono" else mark_it2(loop_col=C["marigold"], dot=C["blue"] if mode == "light" else C["mint"])


def word_variant(i, mode):
    col = "#111" if mode == "mono" else (C["chalk"] if mode == "dark" else C["ink"])
    if i == 0:
        def o(cx, cy):
            g = kancha2(0, 0, 54) if mode == "mono" else kancha2(0, 0, 54, body=C["blue"], night=C["night"], vane=C["marigold"])
            return f'<g transform="translate({f(cx)} {f(cy)})">{g}</g>'
        return word({"o1": o}, col)
    if i == 1:
        def h(side):
            def d(cx, cy):
                hp = hemi2(cx, cy, 54, side)
                if mode == "mono":
                    return f'<path fill="{col}" fill-rule="evenodd" d="{circ(cx, cy, 54)}{hp}"/>'
                return f'<path fill="{C["blue"]}" d="{circ(cx, cy, 54)}"/><path fill="{C["mint"] if side < 0 else C["coral"]}" d="{hp}"/>'
            return d
        return word({"o1": h(-1), "o2": h(1)}, col)
    body, W = word(None, col)
    (x1, y), (x2, _) = o_centre("o1"), o_centre("o2")
    lc = col if mode == "mono" else C["marigold"]
    body += (f'<g transform="translate({f((x1+x2)/2)} {f(y)}) scale(1.36 1.12) translate(-128 -128)">'
             f'<path fill="{lc}" d="{loop2()}"/></g>')
    return body, W


rows, y, W = [], 0, 1260
for mode, bg in (("mono", "#ffffff"), ("dark", C["space"]), ("light", "#ffffff")):
    rows.append(f'<rect x="0" y="{y}" width="{W}" height="660" fill="{bg}"/>')
    for i in range(3):
        x = 30 + i * 420
        s = sym(i, mode)
        rows.append(f'<g transform="translate({x} {y+20}) scale(0.9)">{s}</g>')
        for k, (dx, dy) in ((48 / 256, (250, 40)), (32 / 256, (250, 110)), (16 / 256, (250, 160))):
            rows.append(f'<g transform="translate({x+dx} {y+dy}) scale({k:.4f})">{s}</g>')
        body, ww = word_variant(i, mode)
        rows.append(f'<g transform="translate({x} {y+280}) scale(0.5)">{body}</g>')
        rows.append(f'<g transform="translate({x} {y+430}) scale(0.24)">{body}</g>')
        rows.append(f'<g transform="translate({x} {y+520}) scale(0.12)">{body}</g>')
    y += 660
open(sys.argv[1], "w").write(svg("".join(rows), W, y, "explore v2"))
print(y)
