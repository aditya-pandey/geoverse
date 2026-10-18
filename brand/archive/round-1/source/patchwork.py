"""Concept A (Patchwork) baked into plain paths — no masks.

The disc (centre 128,128, R104) is cut by three border bands, each the stroke of a circular arc (gap 11).
Every piece is a curvilinear triangle bounded by three circles: the disc edge and the two
offset edges of the bands that enclose it. Vertices are exact circle–circle intersections.
"""
import math
from gen4 import MAIN, arc_centre, y_on_main

O = (128.0, 128.0, 104.0)
GAP = 11


def f(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def circles():
    x1, y1, x2, y2, r, sw = MAIN
    m = (*arc_centre(x1, y1, x2, y2, r, sw), r)
    yu, yd = y_on_main(154), y_on_main(86)
    n = (*arc_centre(154, yu, 194, 0, 240, 0), 240)
    s = (*arc_centre(86, yd, 64, 256, 240, 0), 240)
    return m, n, s


def inter(c1, c2):
    (x1, y1, r1), (x2, y2, r2) = c1, c2
    d = math.hypot(x2 - x1, y2 - y1)
    a = (r1 * r1 - r2 * r2 + d * d) / (2 * d); h = math.sqrt(max(r1 * r1 - a * a, 0))
    xm, ym = x1 + a * (x2 - x1) / d, y1 + a * (y2 - y1) / d
    return [(xm + h * (y2 - y1) / d, ym - h * (x2 - x1) / d), (xm - h * (y2 - y1) / d, ym + h * (x2 - x1) / d)]


def side(c, p):
    return math.hypot(p[0] - c[0], p[1] - c[1]) - c[2]          # <0 inside circle c


def piece(seed, pair):
    """Region containing `seed`, bounded by the disc and the two bands named in `pair`. Returns an SVG subpath."""
    m, n, s = circles()
    near = [{"m": m, "n": n, "s": s}[k] for k in pair]
    bands = near
    # offset edges facing the seed
    edges = [(c[0], c[1], c[2] + (GAP / 2 if side(c, seed) > 0 else -GAP / 2)) for c in near]
    sgn = [1 if side(c, seed) > 0 else -1 for c in near]
    ok = lambda p, tol=0.01: (side(O, p) <= tol and all(s * side(c, p) >= -tol for s, c in zip(sgn, edges))
                              and all(abs(side(b, p)) >= GAP / 2 - tol for b in bands))
    E = [O, edges[0], edges[1]]
    # vertices: E[i] ∩ E[i+1]
    V = []
    for i in range(3):
        a, b = E[i], E[(i + 1) % 3]
        cand = [p for p in inter(a, b) if ok(p)]
        V.append(min(cand, key=lambda p: math.hypot(p[0] - seed[0], p[1] - seed[1])))
    # walk: V2 →(on E0 = disc)→ V0 →(on E1)→ V1 →(on E2)→ V2
    path, start = "", V[2]
    path += f"M{f(start[0])} {f(start[1])}"
    for circle, p, q in ((E[0], V[2], V[0]), (E[1], V[0], V[1]), (E[2], V[1], V[2])):
        cx, cy, r = circle
        best = None
        for sweep in (0, 1):
            # midpoint of the small arc p→q for this sweep
            a0, a1 = math.atan2(p[1] - cy, p[0] - cx), math.atan2(q[1] - cy, q[0] - cx)
            da = (a1 - a0) % (2 * math.pi)
            if sweep == 0:
                da -= 2 * math.pi
            mid = (cx + r * math.cos(a0 + da / 2), cy + r * math.sin(a0 + da / 2))
            large = 1 if abs(da) > math.pi else 0
            if ok(mid, 0.05):
                best = (large, sweep)
        assert best, "no valid arc"
        path += f"A{f(r)} {f(r)} 0 {best[0]} {best[1]} {f(q[0])} {f(q[1])}"
    return path + "Z"


SEEDS = {"tl": ((70, 60), "mn"), "tr": ((205, 70), "mn"), "bl": ((50, 160), "ms"), "br": ((160, 190), "ms")}


def pieces():
    return {k: piece(v, pr) for k, (v, pr) in SEEDS.items()}
