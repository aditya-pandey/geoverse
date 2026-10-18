"""Bhoogol identity, round 2: shared geometry helpers. Every shape is drawn clockwise, so one path with
nonzero fill unions cleanly; holes are added with fill-rule="evenodd" where stated."""
import math


def f(v):
    return f"{v:.2f}".rstrip("0").rstrip(".") if abs(v) > 1e-9 else "0"


def P(x, y):
    return f"{f(x)} {f(y)}"


def circ(cx, cy, R, cw=True):
    s = 1 if cw else 0
    return f"M{P(cx-R, cy)}A{f(R)} {f(R)} 0 1 {s} {P(cx+R, cy)}A{f(R)} {f(R)} 0 1 {s} {P(cx-R, cy)}Z"


def ring(cx, cy, R, r):
    return circ(cx, cy, R) + circ(cx, cy, r, cw=False)


def poly(pts):
    a = sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]))
    if a < 0:
        pts = pts[::-1]
    return "M" + "L".join(P(*p) for p in pts) + "Z"


def rect(x0, y0, x1, y1):
    return poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


def band(cx, cy, r, a0, a1, w):
    """Arc stroke: centre-line radius r, angles a0→a1 in degrees (clockwise on screen), width w, butt ends."""
    R, ri = r + w / 2, r - w / 2
    t0, t1 = math.radians(a0), math.radians(a1)
    large = 1 if (a1 - a0) % 360 > 180 else 0
    Q = lambda rr, t: P(cx + rr * math.cos(t), cy + rr * math.sin(t))
    return f"M{Q(R, t0)}A{f(R)} {f(R)} 0 {large} 1 {Q(R, t1)}L{Q(ri, t1)}A{f(ri)} {f(ri)} 0 {large} 0 {Q(ri, t0)}Z"


def stem(x, y0, y1, w, top="round", bottom="flat"):
    """Vertical stroke from y0 (top) to y1 (bottom); ends 'round' (semicircle inside the span) or 'flat'."""
    r = w / 2
    yt = y0 + r if top == "round" else y0
    yb = y1 - r if bottom == "round" else y1
    d = f"M{P(x, yt)}"
    d += f"A{f(r)} {f(r)} 0 0 1 {P(x + w, yt)}" if top == "round" else f"L{P(x + w, yt)}"
    d += f"L{P(x + w, yb)}"
    d += f"A{f(r)} {f(r)} 0 0 1 {P(x, yb)}" if bottom == "round" else f"L{P(x, yb)}"
    return d + "Z"


def circle_inter(c1, c2):
    (x1, y1, r1), (x2, y2, r2) = c1, c2
    d = math.hypot(x2 - x1, y2 - y1)
    a = (r1 * r1 - r2 * r2 + d * d) / (2 * d); h = math.sqrt(max(r1 * r1 - a * a, 0))
    xm, ym = x1 + a * (x2 - x1) / d, y1 + a * (y2 - y1) / d
    return [(xm + h * (y2 - y1) / d, ym - h * (x2 - x1) / d), (xm - h * (y2 - y1) / d, ym + h * (x2 - x1) / d)]


def split_disc(disc, cut, gap):
    """Split a disc (cx,cy,R) by a circular cut (cx,cy,r) of width `gap`. Returns (inside_piece, outside_piece)
    as exact two-arc paths: the part nearer the cut's centre, and the rest."""
    out = []
    for sgn in (-1, 1):
        off = (cut[0], cut[1], cut[2] + sgn * gap / 2)
        p1, p2 = circle_inter(disc, off)
        inside = lambda p: (math.hypot(p[0] - cut[0], p[1] - cut[1]) - cut[2]) * sgn >= gap / 2 - 0.05
        in_disc = lambda p: math.hypot(p[0] - disc[0], p[1] - disc[1]) <= disc[2] + 0.05

        def arc(c, a, b, test):
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
        d = f"M{P(*p1)}" + arc(off, p1, p2, in_disc) + arc(disc, p2, p1, inside) + "Z"
        out.append(d)
    return out[0], out[1]


def svg(inner, w=256, h=256, title="Bhoogol", bg=None):
    b = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(w)} {f(h)}" width="{f(w)}" height="{f(h)}" '
            f'role="img" aria-labelledby="t"><title id="t">{title}</title>{b}{inner}</svg>\n')
