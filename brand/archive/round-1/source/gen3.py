"""v3: patchwork as a political map (T-junction borders), tilt with symmetric poles."""
import math
from gen2 import *

def patch_v3(cx=128, cy=128, Rg=104, gap=11, fill=INK, mid="m3"):
    ox, oy = cx - 128, cy - 128
    # long border: shallow arc, left edge (y≈96) to right edge (y≈156), bowing down
    # two short borders meet it in offset T-junctions, like countries on a map
    cuts = [f"M10 92 A420 420 0 0 0 246 160",           # main border
            f"M150 112 A260 260 0 0 1 182 6",             # up to the top edge
            f"M92 115 A300 300 0 0 0 104 250"]            # down to the bottom edge
    s = "".join(f'<path d="{d}" transform="translate({ox} {oy})" fill="none" stroke="#000" stroke-width="{gap}"/>' for d in cuts)
    return (f'<mask id="{mid}"><rect width="100%" height="100%" fill="#fff"/>{s}</mask>'
            f'<path mask="url(#{mid})" fill="{fill}" d="{circ(cx, cy, Rg)}"/>')

def tilt_v3(cx=128, cy=128, Rg=92, d0=101, d1=124, w=22, fill=INK):
    a = math.radians(23.5); ux, uy = math.sin(a), -math.cos(a); px, py = math.cos(a), math.sin(a)
    pts = [(cx + ux*d + px*s*w/2, cy + uy*d + py*s*w/2) for d, s in ((d0, -1), (d1, -1), (d1, 1), (d0, 1))]
    def bar(P):
        q = [f"{f(x)} {f(y)}" for x, y in P]
        return f"M{q[0]}L{q[1]}A{f(w/2)} {f(w/2)} 0 0 1 {q[2]}L{q[3]}Z"
    south = [(2*cx - x, 2*cy - y) for x, y in pts]
    return f'<path fill="{fill}" d="{circ(cx, cy, Rg)}{bar(pts)}{bar(south)}"/>'

if __name__ == "__main__":   # exploration sheet (v3); importing only needs tilt_v3
    L, W, o1 = wordmark_parts()
    cells = []
    for i, g in enumerate([patch_v3(mid="a"), tilt_v3()]):
        x = 20 + i * 300
        cells.append(f'<g transform="translate({x} 20)">{g}</g>')
        for s, (sx, sy) in ((32, (x, 300)), (16, (x + 50, 308))):
            cells.append(f'<g transform="translate({sx} {sy}) scale({s/256})">{g.replace(chr(34)+"a"+chr(34), chr(34)+"a"+str(s)+chr(34)).replace("url(#a)", f"url(#a{s})")}</g>')
        gr = g.replace('"a"', '"ar"').replace("url(#a)", "url(#ar)").replace(INK, "#f4f1ea")
        cells.append(f'<rect x="{x+90}" y="290" width="150" height="150" rx="16" fill="#06080D"/><g transform="translate({x+105} 305) scale({120/256})">{gr}</g>')
    open("sheet-v3.svg", "w").write(doc("".join(cells), 620, 460, "sheet", bg="#ffffff"))
    open("concept-a-v3.svg", "w").write(doc(patch_v3(), title="Bhoogol — Patchwork"))
    open("concept-c-v3.svg", "w").write(doc(tilt_v3(), title="Bhoogol — Tilt"))
