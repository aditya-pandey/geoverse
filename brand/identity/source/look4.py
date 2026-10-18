import sys
from geo import f, circ, svg
from marks import letters, R, CY, world4
C = dict(space="#12133A", blue="#2E6BFF", mint="#3DDC97", marigold="#FFB020", chalk="#F7F5EF")
def word(col, colour):
    body = ""
    L, W = letters(0)
    for n, d, x in L:
        if n in ("o1", "o2"):
            side = -1 if n == "o1" else 1
            body += world4(x + R, CY, 54, side, mono=col) if not colour else world4(x + R, CY, 54, side, sea=C["blue"], land=C["mint"] if side < 0 else C["marigold"])
        else:
            body += f'<path fill="{col}" d="{d}"/>'
    return body, W
rows = []
b, W = word("#111", False); rows.append(f'<g transform="translate(20 10) scale(1)">{b}</g>')
b, W = word(C["chalk"], True); rows.append(f'<rect y="270" width="1400" height="270" fill="{C["space"]}"/><g transform="translate(20 280)">{b}</g>')
b, W = word(C["space"], True); rows.append(f'<g transform="translate(20 550)">{b}</g>')
for i, (s, x) in enumerate(((1, 960), (0.5, 1200), (0.25, 1330))):
    pass
rows.append(f'<g transform="translate(980 20) scale(0.9)">{world4(60, 60, 60, -1, sea=C["blue"], land=C["mint"])}{world4(190, 60, 60, 1, sea=C["blue"], land=C["marigold"])}</g>')
rows.append(f'<g transform="translate(980 150) scale(0.9)">{world4(60, 60, 60, -1)}{world4(190, 60, 60, 1)}</g>')
open(sys.argv[1], "w").write(svg("".join(rows), 1400, 820, "look", bg="#fff"))
