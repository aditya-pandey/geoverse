"""Bhoogol concept files, colour proposals and recommended direction's masters.
Writes finished assets into this repository's brand/logo/ folder."""
import math, os
from gen2 import circ, ring, rect, arch, bowl, f, wordmark_parts
from gen3 import tilt_v3
from patchwork import pieces
import devanagari as dv

OUT = "/Users/macbook/Documents/Analytics - Work/GeoVerse/brand/logo"
for d in ("concepts", "master"):
    os.makedirs(f"{OUT}/{d}", exist_ok=True)

NAVY, TILE, BEAM, DOT, IVORY = "#06080D", "#13223F", "#F3C9A8", "#2A7FE0", "#F4F1EA"
PASTEL = {"tl": "#A9D39E", "tr": "#F2D48F", "bl": "#F3B59A", "br": "#B9C6EC"}


def svg(inner, w=256, h=256, title="Bhoogol"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" '
            f'aria-labelledby="t"><title id="t">{title}</title>{inner}</svg>\n')


def save(rel, s):
    open(f"{OUT}/{rel}", "w").write(s)


# ── B · Pale Blue Dot: geometry ────────────────────────────────────────────────
DEG = 15                       # beam angle from vertical (a clean 15°)
TILE_D = "M56 0H200A56 56 0 0 1 256 56V200A56 56 0 0 1 200 256H56A56 56 0 0 1 0 200V56A56 56 0 0 1 56 0Z"


def beam_geom(width=72, dr=18, dy=156):
    t = math.tan(math.radians(DEG)); hw = width / 2 / math.cos(math.radians(DEG))
    xt, xb = 128 - 128 * t, 128 + 128 * t
    assert xt - hw >= 56 - 0.5 and xb + hw <= 200 + 0.5, "beam must leave the tile through its straight edges"
    return xt, xb, hw, (128 + (dy - 128) * t, dy, dr)


def pbd_colour(width=72, dr=18, tile=TILE, beam=BEAM, dot=DOT):
    xt, xb, hw, (dx, dy, r) = beam_geom(width, dr)
    band = f"M{f(xt-hw)} 0H{f(xt+hw)}L{f(xb+hw)} 256H{f(xb-hw)}Z"
    return (f'<path id="tile" fill="{tile}" d="{TILE_D}"/><path id="beam" fill="{beam}" d="{band}"/>'
            f'<path id="dot" fill="{dot}" d="{circ(dx, dy, r)}"/>')


def pbd_one(colour, width=72, dr=18):
    """One colour, real knockout: the tile splits into two halves around the beam; the dot stays."""
    xt, xb, hw, (dx, dy, r) = beam_geom(width, dr)
    left = f"M{f(xt-hw)} 0L{f(xb-hw)} 256H56A56 56 0 0 1 0 200V56A56 56 0 0 1 56 0Z"
    right = f"M{f(xt+hw)} 0H200A56 56 0 0 1 256 56V200A56 56 0 0 1 200 256H{f(xb+hw)}Z"
    return f'<path fill="{colour}" d="{left}{right}{circ(dx, dy, r)}"/>'


SMALL = dict(width=72, dr=29)  # favicon drawing: dot ~3.6 px at 16 px

# ── A · Patchwork: four pieces, baked as exact arc paths (no masks) ───────────────
def patch_one(colour="#111111"):
    return f'<path fill="{colour}" d="{"".join(pieces().values())}"/>'


def patch_colour(cols=PASTEL):
    return "".join(f'<path fill="{cols[k]}" d="{d}"/>' for k, d in pieces().items())


# ── Devanagari wordmark: weight-matched to the Latin when scaled by 24/22 ────────
DK = 24 / 22
DX0, DY0, DX1, DY1 = 0, -50, 430, 198        # drawing extents in Devanagari units (o-sign top, ू loop bottom)


def deva(colour, x, y, k):
    """भूगोल with its top-left extent at (x, y), scaled by k."""
    return (f'<g transform="translate({f(x - DX0 * k)} {f(y - DY0 * k)}) scale({f(k)})">'
            f'<path fill="{colour}" d="{dv.bhugol()}"/></g>')


# ── Wordmark at lockup position ─────────────────────────────────────────────────
def wordmark_at(x0, colour):
    L, W, _ = wordmark_parts(x0)
    return f'<path fill="{colour}" d="{"".join(L)}"/>', W - x0   # W includes right margin = x0


def horizontal(symbol_inner, word_colour, title):
    # symbol 160 square, top 21 → bottom 181 (ascender 26 → baseline 176, 5-unit overshoot each side)
    s = 160 / 256
    wm, ww = wordmark_at(224, word_colour)
    w = 224 + (ww - 224) + 24
    return svg(f'<g transform="translate(24 21) scale({s})">{symbol_inner}</g>{wm}', int(w), 256, title)


if __name__ == "__main__":
    # concepts — greyscale
    save("concepts/a-patchwork.svg", svg(patch_one(), title="Bhoogol concept A: Patchwork"))
    save("concepts/b-pale-blue-dot.svg", svg(pbd_one("#111111"), title="Bhoogol concept B: Pale Blue Dot"))
    save("concepts/c-tilt.svg", svg(tilt_v3(), title="Bhoogol concept C: Tilt"))
    # concepts — colour proposals
    save("concepts/a-patchwork-colour.svg", svg(patch_colour(), title="Bhoogol concept A, colour"))
    save("concepts/b-pale-blue-dot-colour.svg", svg(pbd_colour(), title="Bhoogol concept B, colour"))
    d = tilt_v3().split('d="')[1].split('"')[0]
    disc_d, rest = d.split("Z", 2)[0] + "Z" + d.split("Z", 2)[1] + "Z", d.split("Z", 2)[2]
    save("concepts/c-tilt-colour.svg", svg(f'<path fill="#38BDF8" d="{disc_d}"/><path fill="#F59E0B" d="{rest}"/>',
                                           title="Bhoogol concept C, colour"))

    # recommended B — masters
    save("master/bhoogol-symbol.svg", svg(pbd_colour(), title="Bhoogol"))
    save("master/bhoogol-symbol-small.svg", svg(pbd_colour(**SMALL), title="Bhoogol"))
    save("master/bhoogol-symbol-black.svg", svg(pbd_one("#000000"), title="Bhoogol"))
    save("master/bhoogol-symbol-white.svg", svg(pbd_one("#FFFFFF"), title="Bhoogol"))
    L, W, _ = wordmark_parts(24)
    for name, col in (("navy", TILE), ("ivory", IVORY), ("black", "#000000"), ("white", "#FFFFFF")):
        save(f"master/bhoogol-wordmark-{name}.svg", svg(f'<path fill="{col}" d="{"".join(L)}"/>', W, 256, "Bhoogol"))
    save("master/bhoogol-horizontal-on-light.svg", horizontal(pbd_colour(), TILE, "Bhoogol"))
    save("master/bhoogol-horizontal-on-dark.svg", horizontal(pbd_colour(), IVORY, "Bhoogol"))
    save("master/bhoogol-horizontal-black.svg", horizontal(pbd_one("#000000"), "#000000", "Bhoogol"))
    save("master/bhoogol-horizontal-white.svg", horizontal(pbd_one("#FFFFFF"), "#FFFFFF", "Bhoogol"))

    # stacked: symbol 200 centred over wordmark (scaled 0.5)
    k = 0.5; ww = W * k; sw_ = max(ww, 200) + 48
    stacked = (f'<g transform="translate({f((sw_-200)/2)} 24) scale({200/256})">{pbd_colour()}</g>'
               f'<g transform="translate({f((sw_-ww)/2)} 236) scale({k})"><path fill="{TILE}" d="{"".join(L)}"/></g>')
    save("master/bhoogol-stacked-on-light.svg", svg(stacked, int(sw_), 372, "Bhoogol"))

    # Devanagari wordmark on its own (stroke = Latin stem when shown at this size)
    dw, dh = (DX1 - DX0) * DK + 48, (DY1 - DY0) * DK + 48
    for name, col in (("navy", TILE), ("ivory", IVORY), ("peach", BEAM), ("black", "#000000"), ("white", "#FFFFFF")):
        save(f"master/bhoogol-devanagari-{name}.svg", svg(deva(col, 24, 24, DK), int(dw), int(dh), "भूगोल"))

    # bilingual lockup: symbol beside two lines, weights matched (Latin ×0.5, Devanagari ×0.5·24/22)
    a = 0.5; ka = a * DK
    l1 = (234 - 26) * a; l2 = (DY1 - DY0) * ka; gap = 24
    T = l1 + gap + l2                                 # symbol height = text block height
    tx = 24 + T + 40
    Lp, Wp, _ = wordmark_parts(0)
    Wl = (Wp - 0) * a
    width = tx + max(Wl, (DX1 - DX0) * ka) + 24
    def bil(sym, c1, c2, bg=None):
        back = f'<rect width="100%" height="100%" fill="{bg}"/>' if bg else ""
        return svg(back + f'<g transform="translate(24 24) scale({f(T / 256)})">{sym}</g>'
                   f'<g transform="translate({f(tx)} {f(24 - 26 * a)}) scale({a})"><path fill="{c1}" d="{"".join(Lp)}"/></g>'
                   + deva(c2, tx, 24 + l1 + gap, ka), int(width + 1), int(T + 48), "Bhoogol भूगोल")
    save("master/bhoogol-bilingual-on-light.svg", bil(pbd_colour(), TILE, TILE))
    save("master/bhoogol-bilingual-on-dark.svg", bil(pbd_colour(), IVORY, BEAM))
    save("master/bhoogol-bilingual-black.svg", bil(pbd_one("#000000"), "#000000", "#000000"))
    save("master/bhoogol-bilingual-white.svg", bil(pbd_one("#FFFFFF"), "#FFFFFF", "#FFFFFF"))
    print("done")
