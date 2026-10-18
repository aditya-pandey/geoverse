"""Bhoogol round 2: the shared rounded wordmark and three symbol concepts."""
import math
from geo import f, P, circ, ring, rect, band, stem, poly, split_disc, svg

# ── Wordmark "bhoogol": rounded geometric, heavier, friendly ─────────────────────
# baseline 176 · x-height 104 (top 72) · ascender 22 · descender 242 · stem 30 · bowls R54/r24
BASE, XT, ASC, ST = 176, 72, 22, 30
R, r = 54, 24
CY = BASE - 52          # bowl centre; bowl spans 70–178 (2-unit overshoot)
GAPS = dict(bh=16, ho=18, oo=10, og=12, go=12, ol=18)


def letters(x0=0):
    """Returns list of (name, path, x) and total advance. 'o1','o2','o3' are returned separately so concepts can swap them."""
    out, x = [], x0
    out.append(("b", stem(x, ASC, BASE, ST, "round", "flat") + ring(x + R, CY, R, r), x)); x += 2 * R + GAPS["bh"]
    hx = x
    arch = (f"M{P(hx, CY)}A{R-2} {R-2} 0 0 1 {P(hx + 2*(R-2), CY)}L{P(hx + 2*(R-2) - ST, CY)}"
            f"A{f(R-2-ST)} {f(R-2-ST)} 0 0 0 {P(hx + ST, CY)}Z")
    out.append(("h", stem(hx, ASC, BASE, ST, "round", "round") + arch
                + stem(hx + 2 * (R - 2) - ST, CY, BASE, ST, "flat", "round"), x)); x += 2 * (R - 2) + GAPS["ho"]
    out.append(("o1", ring(x + R, CY, R, r), x)); x += 2 * R + GAPS["oo"]
    out.append(("o2", ring(x + R, CY, R, r), x)); x += 2 * R + GAPS["og"]
    gx = x
    # g: bowl + stem; the stem turns left at the bottom (quarter ring) and ends in a round terminal
    DY, qR = 192, 40
    qc = (gx + 2 * R - qR, DY)
    quarter = (f"M{P(qc[0] + qR, DY)}A{qR} {qR} 0 0 1 {P(qc[0], DY + qR)}L{P(qc[0], DY + qR - ST)}"
               f"A{qR - ST} {qR - ST} 0 0 0 {P(qc[0] + qR - ST, DY)}Z")
    tail_x = gx + 30
    tail = rect(tail_x, DY + qR - ST, qc[0] + 0.5, DY + qR) + circ(tail_x, DY + qR - ST / 2, ST / 2)
    out.append(("g", ring(gx + R, CY, R, r) + stem(gx + 2 * R - ST, XT - 2, DY, ST, "flat", "flat") + quarter + tail, gx))
    x += 2 * R + GAPS["go"]
    out.append(("o3", ring(x + R, CY, R, r), x)); x += 2 * R + GAPS["ol"]
    out.append(("l", stem(x, ASC, BASE, ST, "round", "round"), x)); x += ST
    return out, x - x0


def o_centre(name, x0=0):
    for n, d, x in letters(x0)[0]:
        if n == name:
            return x + R, CY


# ── Concept 1 · Kancha: the Earth as a cat's-eye marble ───────────────────────────
def kancha_vane(cx, cy, Rd, k=1.0, rot=-50):
    """Two crescent blades, rotationally symmetric, meeting at the centre: the marble's twisted swirl."""
    L = 0.74 * Rd * k                     # blade length
    ra, rb = 0.52 * L, 1.05 * L           # inner (fat) and outer (thin) arc radii
    paths = []
    for a in (rot, rot + 180):
        t = math.radians(a)
        T = (cx + L * math.cos(t), cy + L * math.sin(t))
        paths.append(f"M{P(cx, cy)}A{f(ra)} {f(ra)} 0 0 1 {P(*T)}A{f(rb)} {f(rb)} 0 0 0 {P(cx, cy)}Z")
    return "".join(paths)


def kancha(cx=128, cy=128, Rd=108, ink="#111", vane=None, k=1.0):
    """Mono: vane cut out (evenodd). Colour: pass vane colour to draw it on top."""
    if vane is None:
        return f'<path fill="{ink}" fill-rule="evenodd" d="{circ(cx, cy, Rd)}{kancha_vane(cx, cy, Rd, k)}"/>'
    return f'<path fill="{ink}" d="{circ(cx, cy, Rd)}"/><path fill="{vane}" d="{kancha_vane(cx, cy, Rd, k)}"/>'


# ── Concept 2 · Twin hemispheres: the "oo" as an old atlas's two hemispheres ───────
def hemisphere(cx, cy, Rd, side, gap=None):
    """A disc split by one coast-curve into land and sea. side=-1 west (Americas), +1 east (Old World)."""
    gap = gap or Rd * 0.16
    # a large circle whose arc crosses the disc like a coastline, bowing outward
    cut = (cx - side * Rd * 1.25, cy - Rd * 0.55, Rd * 1.55)
    return split_disc((cx, cy, Rd), cut, gap)     # (land, sea)


def twin(cx=128, cy=128, Rd=60, gap=8, ink="#111", land=None, sea=None):
    out = ""
    for side, x in ((-1, cx - Rd - gap / 2), (1, cx + Rd + gap / 2)):
        a, b = hemisphere(x, cy, Rd, side)
        if land is None:
            out += f'<path fill="{ink}" d="{a}{b}"/>'
        else:
            out += f'<path fill="{land[0] if side < 0 else land[1]}" d="{a}"/><path fill="{sea}" d="{b}"/>'
    return out


# ── Concept 3 · Mark it: a quick marker loop circling a place ─────────────────────
def _catmull(pts, closed=False):
    """Smooth path through points (centripetal-ish Catmull-Rom → cubic Bézier)."""
    n = len(pts); d = f"M{P(*pts[0])}"
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if closed or i > 0 else pts[i]
        p1, p2 = pts[i], pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if closed or i + 2 < n else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f"C{P(*c1)} {P(*c2)} {P(*p2)}"
    return d


def loop(cx=128, cy=128, rx=96, ry=84, tilt=-14, turns=1.13, wmax=22, start=118, n=34):
    """A hand-drawn marker loop: slightly irregular ellipse, overshooting its start, tapered at both ends."""
    tl = math.radians(tilt)
    centre, normals = [], []
    for i in range(n + 1):
        t = i / n
        th = math.radians(start) - t * turns * 2 * math.pi          # drawn anticlockwise, like most hands do
        wob = 1 + 0.035 * math.sin(2 * th + 0.6) + 0.02 * math.sin(3 * th)
        drift = 1 - 0.07 * t                                         # second pass runs a little inside
        x, y = rx * wob * drift * math.cos(th), ry * wob * drift * math.sin(th)
        X, Y = cx + x * math.cos(tl) - y * math.sin(tl), cy + x * math.sin(tl) + y * math.cos(tl)
        centre.append((X, Y))
    for i, (x, y) in enumerate(centre):
        a, b = centre[max(i - 1, 0)], centre[min(i + 1, n)]
        dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy)
        normals.append((-dy / L, dx / L))
    def width(t):
        return wmax * (0.18 + 0.82 * math.sin(math.pi * min(1, max(0, t))) ** 0.55)
    left = [(x + nx * width(i / n) / 2, y + ny * width(i / n) / 2) for i, ((x, y), (nx, ny)) in enumerate(zip(centre, normals))]
    right = [(x - nx * width(i / n) / 2, y - ny * width(i / n) / 2) for i, ((x, y), (nx, ny)) in enumerate(zip(centre, normals))]
    # outline: left edge forward, round-ish end, right edge back, round-ish start
    pts = left + [centre[-1]] + right[::-1] + [centre[0]]
    return _catmull(pts, closed=True) + "Z"


def mark_it(cx=128, cy=128, ink="#111", dot=None, loop_col=None):
    lc = loop_col or ink; dc = dot or ink
    return (f'<path fill="{lc}" d="{loop(cx, cy)}"/>'
            f'<path fill="{dc}" d="{circ(cx + 10, cy - 6, 21)}"/>')


# ════════════════ v2 refinements ════════════════
def ribbon(points_fn, wfn, n=28):
    """Filled outline of a variable-width stroke along a centre-line given by points_fn(t), t∈[0,1]."""
    C = [points_fn(i / n) for i in range(n + 1)]
    Nn = []
    for i in range(n + 1):
        a, b = C[max(i - 1, 0)], C[min(i + 1, n)]
        dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1
        Nn.append((-dy / L, dx / L))
    left = [(x + nx * wfn(i / n) / 2, y + ny * wfn(i / n) / 2) for i, ((x, y), (nx, ny)) in enumerate(zip(C, Nn))]
    right = [(x - nx * wfn(i / n) / 2, y - ny * wfn(i / n) / 2) for i, ((x, y), (nx, ny)) in enumerate(zip(C, Nn))]
    return _catmull(left + [C[-1]] + right[::-1] + [C[0]], closed=True) + "Z"


def vane2(cx, cy, Rd, rot=-38):
    """Cat's-eye vane: an S-twisted ribbon across the marble, wide in each lobe, pinched where it twists."""
    L = 0.80 * Rd; bow = 0.30 * Rd
    ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    def pt(t):
        u = (t - 0.5) * 2 * L                        # along the axis
        v = bow * math.sin(2 * math.pi * t)          # S-bend across it
        return (cx + u * ca - v * sa, cy + u * sa + v * ca)
    def w(t):
        return 0.34 * Rd * (math.sin(math.pi * t) ** 0.7) * (0.42 + 0.58 * abs(math.cos(math.pi * t)) ** 0.8) + 0.5
    return ribbon(pt, w, 36)


def kancha2(cx=128, cy=128, Rd=108, mono="#111", body=None, night=None, vane=None, shine="#FFFFFF"):
    """Mono: disc with vane and shine cut out. Colour: body, night-side crescent, vane, shine."""
    shine_d = poly_rot_oval(cx - 0.46 * Rd, cy - 0.46 * Rd, 0.17 * Rd, 0.09 * Rd, -45)
    if body is None:
        return f'<path fill="{mono}" fill-rule="evenodd" d="{circ(cx, cy, Rd)}{vane2(cx, cy, Rd)}{shine_d}"/>'
    # night side: the part of the disc outside a larger offset circle → crescent on the lower right
    nd = night_crescent(cx, cy, Rd)
    return (f'<path fill="{body}" d="{circ(cx, cy, Rd)}"/><path fill="{night}" d="{nd}"/>'
            f'<path fill="{vane}" d="{vane2(cx, cy, Rd)}"/><path fill="{shine}" d="{shine_d}"/>')


def poly_rot_oval(cx, cy, a, b, rot):
    """Ellipse as a path (rotated) — via SVG arc commands."""
    t = math.radians(rot)
    p1 = (cx - a * math.cos(t), cy - a * math.sin(t)); p2 = (cx + a * math.cos(t), cy + a * math.sin(t))
    return f"M{P(*p1)}A{f(a)} {f(b)} {f(rot)} 1 1 {P(*p2)}A{f(a)} {f(b)} {f(rot)} 1 1 {P(*p1)}Z"


def night_crescent(cx, cy, Rd, shift=0.30):
    """Crescent = disc minus a same-size disc shifted up-left: the night side, lower right."""
    ox, oy = cx - shift * Rd, cy - shift * Rd
    p1, p2 = circle_inter2((cx, cy, Rd), (ox, oy, Rd))
    # outer arc along the disc (lower-right, the long way round the far side), inner arc along the shifted disc
    return (f"M{P(*p1)}A{f(Rd)} {f(Rd)} 0 0 1 {P(*p2)}A{f(Rd)} {f(Rd)} 0 0 0 {P(*p1)}Z")


def circle_inter2(c1, c2):
    from geo import circle_inter
    a, b = circle_inter(c1, c2)
    return a, b


def blob(pts):
    return _catmull(pts, closed=True) + "Z"


def hemi2(cx, cy, Rd, side):
    """A little world: a disc with one continent. side -1: tall 'Americas' shape; +1: broad 'Old World' shape.
    Shapes are invented, softened silhouettes — they suggest, never trace."""
    k = Rd / 60
    if side < 0:
        pts = [(-18, -46), (6, -40), (22, -24), (12, -8), (0, 2), (10, 18), (16, 36), (4, 48), (-8, 30), (-12, 10), (-30, -8), (-34, -28)]
    else:
        pts = [(-34, -36), (-6, -46), (26, -40), (42, -22), (30, -8), (12, -6), (8, 10), (0, 34), (-14, 40), (-20, 18), (-30, 2), (-40, -16)]
    return blob([(cx + x * k, cy + y * k) for x, y in pts])


def twin2(cx=128, cy=128, Rd=60, gap=8, mono="#111", sea=None, land=None):
    out = ""
    for side, x in ((-1, cx - Rd - gap / 2), (1, cx + Rd + gap / 2)):
        if sea is None:
            out += f'<path fill="{mono}" fill-rule="evenodd" d="{circ(x, cy, Rd)}{hemi2(x, cy, Rd, side)}"/>'
        else:
            out += f'<path fill="{sea}" d="{circ(x, cy, Rd)}"/><path fill="{land[0] if side < 0 else land[1]}" d="{hemi2(x, cy, Rd, side)}"/>'
    return out


def loop2(cx=128, cy=128):
    return loop(cx, cy, rx=98, ry=90, tilt=-20, turns=1.22, wmax=20, start=150, n=40)


def mark_it2(cx=128, cy=128, mono="#111", loop_col=None, dot=None):
    return (f'<path fill="{loop_col or mono}" d="{loop2(cx, cy)}"/>'
            f'<path fill="{dot or mono}" d="{circ(cx + 30, cy - 22, 17)}"/>')


# ════════════════ v3 ════════════════
def arc_on(c, a, b, test):
    """SVG arc from a to b along circle c=(cx,cy,r), choosing the direction whose midpoint passes test()."""
    cx, cy, r = c
    for sweep in (0, 1):
        a0 = math.atan2(a[1] - cy, a[0] - cx); a1 = math.atan2(b[1] - cy, b[0] - cx)
        da = (a1 - a0) % (2 * math.pi)
        if sweep == 0:
            da -= 2 * math.pi
        m = (cx + r * math.cos(a0 + da / 2), cy + r * math.sin(a0 + da / 2))
        if test(m):
            return f"A{f(r)} {f(r)} 0 {1 if abs(da) > math.pi else 0} {sweep} {P(*b)}"
    raise ValueError("no arc")


def night(cx, cy, Rd, dx=-0.34, dy=-0.30):
    """Night side: the disc minus a same-size disc shifted toward the light (upper left)."""
    from geo import circle_inter
    o = (cx + dx * Rd, cy + dy * Rd, Rd)
    p1, p2 = circle_inter((cx, cy, Rd), o)
    out_o = lambda p: math.hypot(p[0] - o[0], p[1] - o[1]) >= Rd - 0.05
    in_d = lambda p: math.hypot(p[0] - cx, p[1] - cy) <= Rd + 0.05
    return f"M{P(*p1)}" + arc_on((cx, cy, Rd), p1, p2, out_o) + arc_on(o, p2, p1, in_d) + "Z"


def eye_vane(cx, cy, Rd, rot=-35):
    """Cat's-eye: a curved lens (flame) across the marble, fuller on one side — a twist caught mid-turn."""
    L = 0.86 * Rd
    ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    def pt(t):
        u = (t - 0.5) * 2 * L
        v = 0.16 * Rd * math.sin(math.pi * t) * (1 if t < 0.5 else 1)  # gentle bow
        return (cx + u * ca - v * sa, cy + u * sa + v * ca)
    def w(t):
        return 0.42 * Rd * (math.sin(math.pi * t) ** 1.1) * (0.75 + 0.25 * math.sin(2 * math.pi * t)) + 0.4
    return ribbon(pt, w, 36)


def kancha3(cx=128, cy=128, Rd=108, mono="#111", body=None, shade=None, vane=None, shine="#FFFFFF"):
    sh = poly_rot_oval(cx - 0.48 * Rd, cy - 0.44 * Rd, 0.16 * Rd, 0.085 * Rd, -42)
    if body is None:
        return f'<path fill="{mono}" fill-rule="evenodd" d="{circ(cx, cy, Rd)}{eye_vane(cx, cy, Rd)}{sh}"/>'
    return (f'<path fill="{body}" d="{circ(cx, cy, Rd)}"/><path fill="{shade}" d="{night(cx, cy, Rd)}"/>'
            f'<path fill="{vane}" d="{eye_vane(cx, cy, Rd)}"/><path fill="{shine}" d="{sh}"/>')


# Continents for the twin worlds: soft, invented silhouettes on a 120-unit disc (radius 60), centre (0,0).
WEST = [  # a north lobe and a south lobe joined by a narrow neck — suggests the Americas without tracing them
    (-30, -40), (-8, -48), (14, -42), (18, -28), (6, -16), (-4, -6), (2, 2), (16, 10), (22, 26), (14, 44),
    (2, 52), (-4, 38), (-6, 20), (-14, 6), (-26, -8), (-36, -24)]
EAST = [  # a broad northern mass with a southern lobe — suggests Afro-Eurasia
    (-38, -30), (-20, -44), (8, -48), (34, -38), (48, -20), (40, -6), (22, -4), (12, 6), (10, 24), (0, 42),
    (-12, 40), (-16, 22), (-22, 6), (-36, -6), (-44, -18)]


def world(cx, cy, Rd, side, mono="#111", sea=None, land=None, shade=None, shade_land=None):
    k = Rd / 60
    pts = [(cx + x * k, cy + y * k) for x, y in (WEST if side < 0 else EAST)]
    lp = blob(pts)
    if sea is None:
        return f'<path fill="{mono}" fill-rule="evenodd" d="{circ(cx, cy, Rd)}{lp}"/>'
    out = f'<path fill="{sea}" d="{circ(cx, cy, Rd)}"/><path fill="{land}" d="{lp}"/>'
    if shade:
        out += f'<path fill="{shade}" fill-opacity="1" d="{night(cx, cy, Rd)}"/>'
    return out


def twin3(cx=128, cy=128, Rd=60, gap=8, **kw):
    lands = kw.pop("lands", (None, None))
    out = ""
    for side, x, ld in ((-1, cx - Rd - gap / 2, lands[0]), (1, cx + Rd + gap / 2, lands[1])):
        out += world(x, cy, Rd, side, land=ld, **kw)
    return out


def mark_it3(cx=128, cy=128, mono="#111", loop_col=None, **wkw):
    w = world(cx + 4, cy + 4, 46, 1, **wkw) if wkw else world(cx + 4, cy + 4, 46, 1, mono=mono)
    return f'{w}<path fill="{loop_col or mono}" d="{loop(cx, cy, rx=104, ry=96, tilt=-18, turns=1.2, wmax=18, start=150, n=40)}"/>'


# ════════════════ v4 continents (final candidates) ════════════════
WEST4 = [  # North America (broad, leaning west) → isthmus → South America (tapering south-east)
    (-44, -24), (-34, -42), (-12, -50), (10, -46), (20, -34), (12, -22), (2, -16), (-2, -8),
    (4, 0), (18, 6), (28, 20), (24, 36), (12, 50), (4, 44), (0, 28), (-8, 14), (-16, 2), (-30, -6)]
EAST4 = [  # Eurasia (wide, across the top) with Africa hanging below its western end
    (-44, -30), (-30, -46), (-4, -52), (26, -46), (46, -30), (50, -14), (36, -8), (22, -10), (10, -6),
    (2, 4), (4, 20), (-4, 38), (-14, 44), (-22, 30), (-24, 12), (-34, 2), (-46, -10)]
AUS4 = [(18, 24), (30, 18), (40, 24), (38, 34), (26, 36), (18, 31)]


def world4(cx, cy, Rd, side, mono="#111", sea=None, land=None, island=True):
    k = Rd / 60
    sc = lambda pts: [(cx + x * k, cy + y * k) for x, y in pts]
    lp = blob(sc(WEST4 if side < 0 else EAST4))
    if side > 0 and island:
        lp += blob(sc(AUS4))
    if sea is None:
        return f'<path fill="{mono}" fill-rule="evenodd" d="{circ(cx, cy, Rd)}{lp}"/>'
    return f'<path fill="{sea}" d="{circ(cx, cy, Rd)}"/><path fill="{land}" d="{lp}"/>'


# ════════════════ v5 continents: few points, deliberate curves ════════════════
WEST5 = [(-40, -30), (-18, -48), (14, -44), (14, -26), (-2, -9), (10, 6), (26, 22), (14, 48), (0, 30), (-14, 2), (-34, -12)]
EAST5 = [(-40, -36), (0, -50), (40, -38), (48, -16), (16, -8), (8, 12), (-2, 40), (-16, 30), (-22, 4), (-42, -12)]


def ellipse(cx, cy, rx, ry, cw=True):
    s = 1 if cw else 0
    return f"M{P(cx-rx, cy)}A{f(rx)} {f(ry)} 0 1 {s} {P(cx+rx, cy)}A{f(rx)} {f(ry)} 0 1 {s} {P(cx-rx, cy)}Z"


def world5(cx, cy, Rd, side, mono="#111", sea=None, land=None, pts=None):
    k = Rd / 60
    P_ = pts or (WEST5 if side < 0 else EAST5)
    lp = blob([(cx + x * k, cy + y * k) for x, y in P_])
    if side > 0 and pts is None:
        lp += ellipse(cx + 31 * k, cy + 30 * k, 11 * k, 7 * k)
    if sea is None:
        return f'<path fill="{mono}" fill-rule="evenodd" d="{circ(cx, cy, Rd)}{lp}"/>'
    return f'<path fill="{sea}" d="{circ(cx, cy, Rd)}"/><path fill="{land}" d="{lp}"/>'


# ════════════════ v6 continents: quadratic B-spline (smooth by construction) ════════════════
def bspline(pts):
    """Closed quadratic B-spline: curves through the midpoints, pulled toward each point. Never wobbles."""
    n = len(pts)
    mid = lambda a, b: ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    d = f"M{P(*mid(pts[-1], pts[0]))}"
    for i in range(n):
        d += f"Q{P(*pts[i])} {P(*mid(pts[i], pts[(i + 1) % n]))}"
    return d + "Z"


WEST6 = [(-48, -24), (-34, -48), (-4, -54), (22, -46), (22, -28), (4, -18), (-2, -6), (12, 2), (30, 14),
         (30, 34), (12, 56), (2, 38), (-6, 16), (-22, 0), (-40, -8)]
EAST6 = [(-50, -24), (-30, -50), (8, -56), (44, -44), (56, -22), (40, -12), (30, -10), (26, 8), (18, -6),
         (8, -6), (16, 10), (6, 34), (-8, 50), (-20, 32), (-26, 10), (-44, 2), (-52, -12)]
AUS6 = [(20, 24), (34, 18), (44, 26), (40, 38), (26, 38)]


def world6(cx, cy, Rd, side, mono="#111", sea=None, land=None):
    k = Rd / 60
    sc = lambda pts: [(cx + x * k, cy + y * k) for x, y in pts]
    lp = bspline(sc(WEST6 if side < 0 else EAST6))
    if side > 0:
        lp += bspline(sc(AUS6))
    if sea is None:
        return f'<path fill="{mono}" fill-rule="evenodd" d="{circ(cx, cy, Rd)}{lp}"/>'
    return f'<path fill="{sea}" d="{circ(cx, cy, Rd)}"/><path fill="{land}" d="{lp}"/>'
