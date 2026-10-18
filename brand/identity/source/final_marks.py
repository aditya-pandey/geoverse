"""Bhoogol identity — final artwork. Every function returns SVG markup (inner content or a full document)."""
import math
from geo import f, P, circ, poly, svg
from marks import letters, R, CY, bspline, ribbon, loop, kancha_vane, vane2, poly_rot_oval, night
import deva_round

# ── palette ─────────────────────────────────────────────────────────────────────
SPACE, SPACE2, SPACE3 = "#12133A", "#1B1D4A", "#272B62"
CHALK, WHITE = "#F7F5EF", "#FFFFFF"
BLUE, BLUE_DEEP, BLUE_NIGHT = "#2E6BFF", "#2A62F0", "#1C45B8"
MINT, MARIGOLD, DANGER = "#3DDC97", "#FFB020", "#B83A1F"
MOON, MOON_DARK = "#C9CBE0", "#9EA1C2"

# ── continents (B-spline control points on a radius-60 disc; kept ≤51 from centre so land never meets the rim) ──
def _clamp(pts, rmax=51):
    out = []
    for x, y in pts:
        rr = math.hypot(x, y)
        out.append((x * rmax / rr, y * rmax / rr) if rr > rmax else (x, y))
    return out


WEST = _clamp([(-48, -24), (-34, -48), (-4, -54), (22, -46), (22, -28), (4, -18), (-2, -6), (12, 2), (30, 14),
               (30, 34), (12, 56), (2, 38), (-6, 16), (-22, 0), (-40, -8)])
EAST = _clamp([(-50, -24), (-30, -50), (8, -56), (44, -44), (56, -22), (40, -12), (30, -10), (26, 8), (18, -6),
               (8, -6), (16, 10), (6, 34), (-8, 50), (-20, 32), (-26, 10), (-44, 2), (-52, -12)])
AUS = [(20, 24), (34, 18), (44, 26), (40, 38), (26, 38)]


def land(cx, cy, Rd, side):
    k = Rd / 60
    sc = lambda pts: [(cx + x * k, cy + y * k) for x, y in pts]
    d = bspline(sc(WEST if side < 0 else EAST))
    if side > 0:
        d += bspline(sc(AUS))
    return d


def world(cx, cy, Rd, side, mono=None, sea=BLUE, ground=None, shade=False):
    """One little world. side −1: the Americas (mint); +1: Afro-Eurasia with India and Australia (marigold).
    mono: a single ink with the land knocked out."""
    if mono:
        return f'<path fill="{mono}" fill-rule="evenodd" d="{circ(cx, cy, Rd)}{land(cx, cy, Rd, side)}"/>'
    g = ground or (MINT if side < 0 else MARIGOLD)
    out = f'<path fill="{sea}" d="{circ(cx, cy, Rd)}"/><path fill="{g}" d="{land(cx, cy, Rd, side)}"/>'
    if shade:
        out += f'<path fill="{SPACE}" fill-opacity="0.32" d="{night(cx, cy, Rd)}"/>'
    return out


# ── wordmark ────────────────────────────────────────────────────────────────────
def wordmark_inner(ink, mono=False, x0=0):
    """The 'bhoogol' wordmark: rounded letters in `ink`; the oo are two worlds (colour, or knocked out when mono)."""
    body = ""
    L, W = letters(x0)
    for n, d, x in L:
        if n in ("o1", "o2"):
            side = -1 if n == "o1" else 1
            body += world(x + R, CY, 54, side, mono=ink if mono else None)
        else:
            body += f'<path fill="{ink}" d="{d}"/>'
    return body, W


WM_TOP, WM_BOTTOM = 22, 232       # ascender top, descender bottom (g's tail)


def wordmark_svg(ink, mono=False, pad=24, title="Bhoogol"):
    body, W = wordmark_inner(ink, mono)
    h = WM_BOTTOM - WM_TOP + 2 * pad
    return svg(f'<g transform="translate({pad} {pad - WM_TOP})">{body}</g>', W + 2 * pad, h, title)


# ── Devanagari wordmark ─────────────────────────────────────────────────────────
DX0, DY0, DX1, DY1 = deva_round.EXTENTS


def deva_inner(ink, x, y, k):
    return (f'<g transform="translate({f(x - DX0 * k)} {f(y - DY0 * k)}) scale({f(k)})">'
            f'<path fill="{ink}" d="{deva_round.bhugol()}"/></g>')


def deva_svg(ink, pad=24, title="भूगोल"):
    k = 30 / 26      # stroke matches the Latin stem at the Latin's own size
    w, h = (DX1 - DX0) * k + 2 * pad, (DY1 - DY0) * k + 2 * pad
    return svg(deva_inner(ink, pad, pad, k), w, h, title)


def bilingual_svg(ink, deva_ink=None, mono=False, pad=32, title="Bhoogol भूगोल"):
    """Latin above Devanagari, left-aligned, strokes matched (Devanagari scaled 30/26 × the Latin's scale)."""
    a = 1.0
    body, W = wordmark_inner(ink, mono)
    lh = (WM_BOTTOM - WM_TOP) * a
    gap = 40
    k = a * 30 / 26 * 0.84     # a step below stroke-match so the Latin leads
    dh = (DY1 - DY0) * k
    w = max(W * a, (DX1 - DX0) * k) + 2 * pad
    h = lh + gap + dh + 2 * pad
    out = (f'<g transform="translate({pad} {f(pad - WM_TOP * a)}) scale({a})">{body}</g>'
           + deva_inner(deva_ink or ink, pad + 2, pad + lh + gap, k))
    return svg(out, w, h, title)


# ── symbol (the two worlds), favicon world, app icon ───────────────────────────
def twin_inner(cx=128, cy=128, Rd=56, gap=10, mono=None, shade=False):
    return (world(cx - Rd - gap / 2, cy, Rd, -1, mono=mono, shade=shade)
            + world(cx + Rd + gap / 2, cy, Rd, 1, mono=mono, shade=shade))


def symbol_svg(mono=None, title="Bhoogol symbol"):
    return svg(twin_inner(mono=mono), 256, 256, title)


def favicon_svg(mono=None, title="Bhoogol"):
    return svg(world(128, 128, 120, 1, mono=mono), 256, 256, title)


def app_icon_svg(title="Bhoogol app icon"):
    """Full-bleed square (platforms round the corners). Deep space, the two worlds, a little marigold sparkle."""
    inner = f'<rect width="256" height="256" fill="{SPACE}"/>' + twin_inner(128, 132, 50, 10)
    inner += f'<path fill="{MARIGOLD}" d="{sparkle(206, 62, 13)}"/>'
    inner += f'<path fill="{CHALK}" fill-opacity="0.9" d="{circ(46, 58, 3.2)}{circ(70, 206, 2.4)}{circ(214, 196, 2.8)}"/>'
    return svg(inner, 256, 256, title)


# ── teacher's marks (the graphic device) ───────────────────────────────────────
def mark_circle():
    return loop(128, 128, rx=104, ry=74, tilt=-6, turns=1.16, wmax=16, start=160, n=44)


def mark_underline(x0=12, x1=244, y=128, w=14):
    def pt(t):
        x = x0 + (x1 - x0) * t
        return (x, y + 5 * math.sin(t * math.pi * 1.6 + 0.4) - 6 * t)
    return ribbon(pt, lambda t: w * (0.25 + 0.75 * math.sin(math.pi * t) ** 0.4), 30)


def mark_arrow():
    def pt(t):
        # a confident curve from lower-left up to the right
        x = 30 + 180 * t
        y = 210 - 150 * t - 60 * math.sin(math.pi * t)
        return (x, y)
    shaft = ribbon(pt, lambda t: 15 * (0.3 + 0.7 * math.sin(math.pi * min(1, t * 1.15)) ** 0.5), 30)
    tip = pt(1.0); back = pt(0.94)
    ang = math.atan2(tip[1] - back[1], tip[0] - back[0])
    heads = ""
    for da in (2.55, -2.55):
        a = ang + da
        end = (tip[0] + 46 * math.cos(a), tip[1] + 46 * math.sin(a))
        heads += ribbon(lambda t, e=end: (tip[0] + (e[0] - tip[0]) * t, tip[1] + (e[1] - tip[1]) * t),
                        lambda t: 14 * (1 - 0.6 * t), 8)
    return shaft + heads


def mark_tick():
    a, b, c = (44, 132), (100, 190), (222, 58)
    l1 = math.hypot(b[0] - a[0], b[1] - a[1]); l2 = math.hypot(c[0] - b[0], c[1] - b[1]); split = l1 / (l1 + l2)
    def pt(t):
        if t <= split:
            u = t / split
            return (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u)
        u = (t - split) / (1 - split)
        return (b[0] + (c[0] - b[0]) * u, b[1] + (c[1] - b[1]) * u)
    return ribbon(pt, lambda t: 6 + 14 * math.sin(math.pi * min(1, t * 1.25)) ** 0.5 * (1 - 0.45 * t), 40)


def sparkle(cx, cy, s):
    """Four-point sparkle: quadratic sides pulled to the centre."""
    k = 0.18 * s
    pts = [(cx, cy - s), (cx + s, cy), (cx, cy + s), (cx - s, cy)]
    d = f"M{P(*pts[0])}"
    for i in range(4):
        q = pts[(i + 1) % 4]
        d += f"Q{P(cx + (k if i in (0, 1) else -k), cy + (k if i in (1, 2) else -k))} {P(*q)}"
    return d + "Z"


def mark_svg(kind, ink=MARIGOLD, title=None):
    d = {"circle": mark_circle, "underline": mark_underline, "arrow": mark_arrow, "tick": mark_tick,
         "sparkle": lambda: sparkle(128, 128, 110)}[kind]()
    return svg(f'<path fill="{ink}" d="{d}"/>', 256, 256, title or f"Marker {kind}")


# ── little worlds, moon, kanche (marbles) ──────────────────────────────────────
def moon_inner(cx=128, cy=128, Rd=100):
    craters = circ(cx - 34, cy - 30, 16) + circ(cx + 28, cy + 6, 22) + circ(cx - 18, cy + 44, 11)
    return (f'<path fill="{MOON}" d="{circ(cx, cy, Rd)}"/><path fill="{MOON_DARK}" d="{craters}"/>'
            f'<path fill="{SPACE}" fill-opacity="0.28" d="{night(cx, cy, Rd)}"/>')


def kancha_inner(cx=128, cy=128, Rd=100, body=BLUE, vane=MARIGOLD):
    sh = poly_rot_oval(cx - 0.46 * Rd, cy - 0.46 * Rd, 0.17 * Rd, 0.09 * Rd, -45)
    return (f'<path fill="{body}" d="{circ(cx, cy, Rd)}"/>'
            f'<path fill="{vane}" d="{vane2(cx, cy, Rd)}"/>'
            f'<path fill="{SPACE}" fill-opacity="0.22" d="{night(cx, cy, Rd)}"/>'
            f'<path fill="{WHITE}" fill-opacity="0.9" d="{sh}"/>')


def confetti_svg(size=512):
    """Brand pattern tile: a calm scatter of worlds, a moon, marbles, sparkles and dots on deep space."""
    s = size / 512
    g = lambda inner, x, y, k: f'<g transform="translate({f(x*s)} {f(y*s)}) scale({f(k*s)})">{inner}</g>'
    items = [f'<rect width="{size}" height="{size}" fill="{SPACE}"/>',
             g(world(128, 128, 100, 1, shade=True), 40, 50, 0.62),
             g(world(128, 128, 100, -1, shade=True), 330, 300, 0.5),
             g(moon_inner(), 360, 40, 0.28),
             g(kancha_inner(body=MINT, vane=BLUE), 120, 330, 0.3),
             g(kancha_inner(body=MARIGOLD, vane=BLUE), 250, 190, 0.18),
             f'<path fill="{MARIGOLD}" d="{sparkle(300*s, 120*s, 12*s)}{sparkle(70*s, 300*s, 9*s)}{sparkle(470*s, 470*s, 10*s)}"/>',
             f'<path fill="{CHALK}" fill-opacity="0.85" d="{circ(220*s, 40*s, 3*s)}{circ(480*s, 220*s, 2.5*s)}{circ(30*s, 470*s, 3*s)}{circ(200*s, 470*s, 2*s)}{circ(470*s, 120*s, 2*s)}"/>']
    return svg("".join(items), size, size, "Bhoogol pattern")


# ── icons: 24px grid, 2px stroke, round caps and joins ──────────────────────────
ICONS = {
    "globe": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.5 3.8 5.5 3.8 9s-1.2 6.5-3.8 9c-2.6-2.5-3.8-5.5-3.8-9S9.4 5.5 12 3z"/>',
    "quiz": '<path d="M5 4.5h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-6.5L8 20.5V17H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z"/><path d="M9.8 9.2a2.2 2.2 0 1 1 3.1 2c-.6.3-.9.7-.9 1.3v.3"/><path d="M12 15h.01"/>',
    "compare": '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>',
    "layers": '<path d="M12 3.5 21 8.5l-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
    "search": '<circle cx="11" cy="11" r="7"/><path d="m20 20-4.2-4.2"/>',
    "wildlife": '<path d="M12 13c-2.9 0-5 2.3-5 4.4 0 1.6 1.3 2.6 2.8 2.6.9 0 1.4-.4 2.2-.4s1.3.4 2.2.4c1.5 0 2.8-1 2.8-2.6 0-2.1-2.1-4.4-5-4.4z"/><circle cx="5.5" cy="10" r="1.7"/><circle cx="9.3" cy="6" r="1.7"/><circle cx="14.7" cy="6" r="1.7"/><circle cx="18.5" cy="10" r="1.7"/>',
    "tour": '<path d="M5 21V4"/><path d="M5 4.5h12l-2.5 4 2.5 4H5"/>',
    "play": '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M8 10.5v4M6 12.5h4"/><path d="M15.5 11.5h.01M18 13.5h.01"/>',
    "river": '<path d="M8 3c-3 3 3 6 0 9s3 6 0 9"/><path d="M15 3c-3 3 3 6 0 9s3 6 0 9"/>',
    "mountain": '<path d="m2.5 19 6.5-11 4 6.5 2.5-3.5 6 8z"/>',
    "ocean": '<path d="M3 9c1.8 0 2.2-2 4.5-2s2.7 2 4.5 2 2.2-2 4.5-2S19.2 9 21 9"/><path d="M3 15c1.8 0 2.2-2 4.5-2s2.7 2 4.5 2 2.2-2 4.5-2 2.7 2 4.5 2"/>',
    "capital": '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/>',
    "mark": '<path d="M18.6 8.2C17.1 5.4 13.9 4 10.4 4.8 6.6 5.7 4 9.1 4.6 13c.7 4.1 4.6 6.9 8.7 6.4 4-.5 6.8-3.9 6.4-7.6-.2-1.5-.8-2.9-1.9-4"/><path d="M12 12h.01"/>',
    "star": '<path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
    "sound": '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6"/><path d="M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/>',
    "settings": '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    "share": '<path d="M12 15V4"/><path d="m8 7.5 4-3.5 4 3.5"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
}


def icon_svg(name, ink=SPACE, size=24):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="{size}" height="{size}" fill="none" '
            f'stroke="{ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" '
            f'aria-labelledby="t"><title id="t">{name}</title>{ICONS[name]}</svg>\n')
