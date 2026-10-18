"""भूगोल — rounded geometric Devanagari, drawn to match the round-2 Latin wordmark.

Same letter skeleton as round 1 (checked against standard Devanagari outlines), redrawn heavier
(stroke 26, headline 24) with round terminals on every free end, like the Latin letters.
Units: headline top 0, baseline 130. Next to the Latin, scale by (Latin stem 30 / 26) × the Latin's scale.
"""
import math
from geo import f, P, circ, poly, band

W, HL, BASE = 26, 24, 130
r = W / 2


def vstem(xc, y0, y1, bottom="round"):
    """Vertical stroke centred on xc, from y0 down to y1 (y1 = the stroke's lowest point)."""
    if bottom == "round":
        return poly([(xc - r, y0), (xc + r, y0), (xc + r, y1 - r), (xc - r, y1 - r)]) + circ(xc, y1 - r, r)
    return poly([(xc - r, y0), (xc + r, y0), (xc + r, y1), (xc - r, y1)])


def bar(p, q, w=W, cap_end=True):
    (x0, y0), (x1, y1) = p, q
    L = math.hypot(x1 - x0, y1 - y0); nx, ny = -(y1 - y0) / L * w / 2, (x1 - x0) / L * w / 2
    d = poly([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)])
    return d + (circ(x1, y1, w / 2) if cap_end else "")


def band_cap(cx, cy, rr, a, w=W):
    t = math.radians(a)
    return circ(cx + rr * math.cos(t), cy + rr * math.sin(t), w / 2)


def bhugol():
    p = []
    # भ — top hook (lead-in with a round end), stem, crossbar, vertical
    hc = (16, 35); hr = 22
    p += [poly([(13, hc[1] - hr - r), (16, hc[1] - hr - r), (16, hc[1] - hr + r), (13, hc[1] - hr + r)]),
          circ(13, hc[1] - hr, r),
          band(hc[0], hc[1], hr, 270, 360, W),
          vstem(38, hc[1], 100),
          poly([(51, 61), (80, 61), (80, 83), (51, 83)]),
          vstem(91, 0, BASE, bottom="flat")]
    # ू — closed loop under the vertical, tail sweeping down-right with a round end
    p += [band(80, 164, 23, 0, 180, W), band(80, 164, 23, 180, 360, W),
          band(70, 196, 66, 290, 352, W), band_cap(70, 196, 66, 352)]
    # ग — short left stem, full vertical
    p += [vstem(143, 0, 88), vstem(207, 0, BASE)]
    # ो — a third vertical; the o-sign rises up-left (30° from vertical) to a round end
    a = math.radians(30)
    p += [vstem(265, 0, BASE), bar((265, 10), (265 - 56 * math.sin(a), 8 - 56 * math.cos(a)))]
    # ल — bowl (round tail end), small arch into the vertical, short inner stem
    p += [band(336, 86, 31, 50, 330, W), band_cap(336, 86, 31, 50),
          band(383, 72, 26, 180, 360, W), vstem(357, 72, 92), vstem(409, 0, BASE)]
    # headline
    p += [poly([(64, 0), (432, 0), (432, HL), (64, HL)])]
    return "".join(p)


EXTENTS = (0, -56, 432, 200)   # x0, y0 (o-sign top), x1, y1 (ू loop bottom)
