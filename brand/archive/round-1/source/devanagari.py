"""भूगोल — custom geometric Devanagari wordmark, drawn to match the Latin "bhoogol".

Built from straight bars and circular-arc bands only (all clockwise, nonzero fill → seamless unions).
Units: headline 0–20, baseline (bottom of the vertical strokes) 130, stroke 22.
Set at 150/130 scale next to the Latin wordmark, the stroke matches the Latin 24-unit stem.
Skeleton follows standard Devanagari letter structure (checked against Kohinoor/ITF/Sangam outlines).
"""
import math

W = 22          # stroke
HL = 20         # headline thickness
BASE = 130


def f(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def poly(pts):
    a = sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]))
    if a < 0:
        pts = pts[::-1]
    return "M" + "L".join(f"{f(x)} {f(y)}" for x, y in pts) + "Z"


def rect(x0, y0, x1, y1):
    return poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


def bar(p, q, w=W):
    """A straight stroke from p to q with butt ends."""
    (x0, y0), (x1, y1) = p, q
    L = math.hypot(x1 - x0, y1 - y0); nx, ny = -(y1 - y0) / L * w / 2, (x1 - x0) / L * w / 2
    return poly([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)])


def band(cx, cy, r, a0, a1, w=W):
    """Arc stroke on centre (cx,cy), centre-line radius r, from angle a0 to a1 (degrees, clockwise on screen)."""
    R, ri = r + w / 2, r - w / 2
    t0, t1 = math.radians(a0), math.radians(a1)
    large = 1 if (a1 - a0) % 360 > 180 else 0
    P = lambda rr, t: f"{f(cx + rr * math.cos(t))} {f(cy + rr * math.sin(t))}"
    return (f"M{P(R, t0)}A{f(R)} {f(R)} 0 {large} 1 {P(R, t1)}L{P(ri, t1)}"
            f"A{f(ri)} {f(ri)} 0 {large} 0 {P(ri, t0)}Z")


def bhugol():
    p = []
    # ── भ: open hook → stem, crossbar, full vertical ───────────────────────────
    p += [rect(0, 0, 16, W),                    # lead-in of the top hook (sits level with the headline)
          band(16, 33, 22, 270, 360),           # hook turns down into the stem
          rect(27, 33, 49, 100),                # stem (runs a little past the crossbar, as in the script)
          rect(49, 62, 82, 62 + HL),            # crossbar to the vertical
          rect(80, 0, 102, BASE)]               # vertical (danda)
    # ── ू: loop under the vertical with a tail sweeping down-right ────────────────
    p += [band(80, 164, 23, 0, 180), band(80, 164, 23, 180, 360),   # closed loop under the vertical (counter r12)
          band(70, 196, 66, 290, 352)]          # tail leaves the loop's top-right and sweeps down-right
    # ── ग: short left stem (foot cut at the symbol's 15°), full vertical ──────────
    t = math.tan(math.radians(15)) * W
    p += [poly([(132, 0), (154, 0), (154, 88 - t), (132, 88)]),
          rect(196, 0, 218, BASE)]
    # ── ो: a third vertical, and the o-sign rising up-left above the headline (30° from vertical) ──
    a = math.radians(30)
    top = (263 - 58 * math.sin(a), 6 - 58 * math.cos(a))
    p += [rect(254, 0, 276, BASE), bar((265, 10), top)]
    # ── ल: big bowl with a tail, small arch, vertical ────────────────────────────
    p += [band(336, 86, 31, 50, 330),            # big bowl, open to the right; tail end bottom-right
          band(383, 72, 26, 180, 360),           # small arch from the bowl's top-right into the vertical
          rect(346, 72, 368, 92),                # short inner stem under the arch's left leg
          rect(398, 0, 420, BASE)]               # vertical
    # ── headline: starts over भ's vertical, runs to the end ──────────────────────
    p += [rect(64, 0, 430, HL)]
    return "".join(p)


BBOX = (0, -50, 430, 198)   # x0, y0 (o-sign top), x1, y1 (ू loop bottom)


if __name__ == "__main__":
    import sys
    d = bhugol()
    out = sys.argv[1] if len(sys.argv) > 1 else "deva-test.svg"
    open(out, "w").write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -80 480 320" width="960" height="640">'
        f'<rect x="-20" y="-80" width="480" height="320" fill="#fff"/><path fill="#111" d="{d}"/></svg>\n')
