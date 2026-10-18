"""Bhoogol logo concepts — v2 geometry. All shapes clockwise, nonzero fill, so unions have no seams."""
import math, os

OUT = os.path.dirname(os.path.abspath(__file__))
INK = "#111111"


def f(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def circ(cx, cy, R, cw=True):
    s = 1 if cw else 0
    return f"M{f(cx-R)} {f(cy)}A{f(R)} {f(R)} 0 1 {s} {f(cx+R)} {f(cy)}A{f(R)} {f(R)} 0 1 {s} {f(cx-R)} {f(cy)}Z"


def ring(cx, cy, R, r):
    return circ(cx, cy, R) + circ(cx, cy, r, cw=False)


def rect(x, y, w, h):
    return f"M{f(x)} {f(y)}H{f(x+w)}V{f(y+h)}H{f(x)}Z"


def arch(cx, cy, R, r):          # upper half ring, clockwise
    return f"M{f(cx-R)} {f(cy)}A{f(R)} {f(R)} 0 0 1 {f(cx+R)} {f(cy)}H{f(cx+r)}A{f(r)} {f(r)} 0 0 0 {f(cx-r)} {f(cy)}Z"


def bowl(cx, cy, R, r):          # lower half ring, clockwise
    return f"M{f(cx+R)} {f(cy)}A{f(R)} {f(R)} 0 0 1 {f(cx-R)} {f(cy)}H{f(cx-r)}A{f(r)} {f(r)} 0 0 0 {f(cx+r)} {f(cy)}Z"


def doc(inner, w=256, h=256, title="Bhoogol", bg=None):
    b = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img">'
            f"<title>{title}</title>{b}{inner}</svg>\n")


def save(name, s):
    open(os.path.join(OUT, name), "w").write(s)


# ── Wordmark — geometric lowercase, constructed ─────────────────────────────────
BASE, XT, ASC, ST, R, r = 176, 76, 26, 24, 52, 28
CY = BASE - 50


SLANT = 24 * 0.26795  # stem tops cut at 15°, square to the symbol's sunbeam


def stem(x):
    return f"M{f(x)} {f(ASC+SLANT)}L{f(x+ST)} {ASC}V{BASE}H{f(x)}Z"


def wordmark_parts(x0=24):
    """Returns ({letter: path}, width, centre of first 'o')."""
    L, x = [], x0
    L.append(stem(x) + ring(x + R, CY, R, r)); x += 2 * R + 18            # b
    L.append(stem(x) + arch(x + 50, CY, 50, 26) + rect(x + 76, CY, ST, BASE - CY)); x += 100 + 20  # h
    o1 = (x + R, CY)
    L.append(ring(x + R, CY, R, r)); x += 2 * R + 12                                            # o
    L.append(ring(x + R, CY, R, r)); x += 2 * R + 12                                            # o
    L.append(ring(x + R, CY, R, r) + rect(x + 2 * R - ST, XT - 2, ST, 186 - XT + 2)
             + bowl(x + 2 * R - 48, 186, 48, 24)); x += 2 * R + 12                              # g
    L.append(ring(x + R, CY, R, r)); x += 2 * R + 18                                            # o
    L.append(stem(x)); x += ST                                             # l
    return L, x + x0, o1


# ── Patchwork globe: disc cut by three "border" arcs (exploration via mask) ───────
def patch_cuts():
    # each cut = (cx, cy, radius) of a large circle crossing the disc; gap width drawn as stroke
    return [(300, 40, 236), (-30, 320, 214), (250, -40, 150)]


def patch_globe(cx=128, cy=128, Rg=104, gap=11, fill=INK, mid="m"):
    cuts = "".join(f'<circle cx="{f(cx-128+a)}" cy="{f(cy-128+b)}" r="{f(c)}" fill="none" stroke="#000" stroke-width="{gap}"/>'
                   for a, b, c in patch_cuts())
    return (f'<mask id="{mid}"><rect width="100%" height="100%" fill="#fff"/>{cuts}</mask>'
            f'<path mask="url(#{mid})" fill="{fill}" d="{circ(cx, cy, Rg)}"/>')


# ── Tilt globe: a disc and its 23.5° axis, which shows only at the poles ──────────
def tilt_globe(cx=128, cy=128, Rg=92, stub=(104, 126), w=22, fill=INK):
    a = math.radians(23.5)
    ux, uy = math.sin(a), -math.cos(a)          # axis direction (north = up, leaning right)
    px, py = math.cos(a), math.sin(a)           # perpendicular
    def bar(d0, d1):
        pts = [(cx + ux * d + px * s * w / 2, cy + uy * d + py * s * w / 2) for d, s in ((d0, -1), (d1, -1), (d1, 1), (d0, 1))]
        x = [f"{f(p[0])} {f(p[1])}" for p in pts]
        # rounded outer end
        return f"M{x[0]}L{x[1]}A{f(w/2)} {f(w/2)} 0 0 {1 if d1 > 0 else 1} {x[2]}L{x[3]}Z"
    north = bar(stub[0], stub[1]); south = bar(-stub[0], -stub[1])
    return f'<path fill="{fill}" d="{circ(cx, cy, Rg)}{north}{south}"/>'


# ── Pale blue dot tile ─────────────────────────────────────────────────────────
def pbd(tile=INK, beam="#ffffff", dot=INK, dr=18, deg=12):
    t = math.tan(math.radians(deg)); hw = 42 / math.cos(math.radians(deg))
    xt, xb = 128 - 128 * t, 128 + 128 * t
    T = "M56 0H200A56 56 0 0 1 256 56V200A56 56 0 0 1 200 256H56A56 56 0 0 1 0 200V56A56 56 0 0 1 56 0Z"
    band = f"M{f(xt-hw)} 0H{f(xt+hw)}L{f(xb+hw)} 256H{f(xb-hw)}Z"
    dy = 156; dx = 128 + (dy - 128) * t
    return f'<path fill="{tile}" d="{T}"/><path fill="{beam}" d="{band}"/><path fill="{dot}" d="{circ(dx, dy, dr)}"/>'


if __name__ == "__main__":
    L, W, o1 = wordmark_parts()
    save("wordmark-v2.svg", doc(f'<path fill="{INK}" d="{"".join(L)}"/>', W, 256, "Bhoogol wordmark"))
    save("concept-a-v2.svg", doc(patch_globe(), title="Bhoogol — Patchwork"))
    save("concept-b-v2.svg", doc(pbd(), title="Bhoogol — Pale Blue Dot"))
    save("concept-c-v2.svg", doc(tilt_globe(), title="Bhoogol — Tilt"))

    # contact sheet: three symbols at 160 + 32 + 16, then wordmark
    cells = []
    for i, (name, g) in enumerate([("A", patch_globe(mid="ma")), ("B", pbd()), ("C", tilt_globe())]):
        x = 20 + i * 300
        cells.append(f'<g transform="translate({x} 20) scale(1)">{g.replace("url(#ma)", "url(#ma)")}</g>')
        for s, (sx, sy) in ((32, (x + 0, 300)), (16, (x + 50, 308))):
            k = s / 256
            gg = g.replace('id="ma"', f'id="ma{s}"').replace("url(#ma)", f"url(#ma{s})")
            cells.append(f'<g transform="translate({sx} {sy}) scale({k})">{gg}</g>')
        # reversed on navy
        gg = g.replace('id="ma"', 'id="mar"').replace("url(#ma)", "url(#mar)").replace(INK, "#f4f1ea")
        if name == "B":
            gg = pbd(tile="#f4f1ea", beam="#06080D", dot="#f4f1ea")
        cells.append(f'<rect x="{x+90}" y="290" width="150" height="150" rx="16" fill="#06080D"/>'
                     f'<g transform="translate({x+105} 305) scale({120/256})">{gg}</g>')
    cells.append(f'<g transform="translate(20 470) scale(0.8)"><path fill="{INK}" d="{"".join(L)}"/></g>')
    save("sheet-v2.svg", doc("".join(cells), 920, 690, "sheet", bg="#ffffff"))
    print("wordmark width", W)
