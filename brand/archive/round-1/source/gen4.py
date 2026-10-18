"""v4: patchwork borders meet properly (T-junctions computed on the main border)."""
import math
from gen2 import *
from gen3 import tilt_v3

def arc_centre(x1, y1, x2, y2, r, sweep):
    mx, my = (x1+x2)/2, (y1+y2)/2; dx, dy = x2-x1, y2-y1; q = math.hypot(dx, dy)
    h = math.sqrt(r*r - (q/2)**2); nx, ny = -dy/q, dx/q
    s = 1 if sweep == 1 else -1          # large-arc=0
    return mx + s*nx*h, my + s*ny*h

MAIN = (6, 100, 250, 150, 360, 0)        # x1 y1 x2 y2 r sweep
def y_on_main(x):
    x1, y1, x2, y2, r, sw = MAIN; cx, cy = arc_centre(x1, y1, x2, y2, r, sw)
    ys = [cy + math.sqrt(r*r - (x-cx)**2), cy - math.sqrt(r*r - (x-cx)**2)]
    return min(ys, key=lambda y: abs(y - (y1 + (y2-y1)*(x-x1)/(x2-x1))))

def patch_v4(cx=128, cy=128, Rg=104, gap=11, fill=INK, mid="m4"):
    x1, y1, x2, y2, r, sw = MAIN
    yu, yd = y_on_main(154), y_on_main(86)
    cuts = [f"M{x1} {y1}A{r} {r} 0 0 {sw} {x2} {y2}",
            f"M154 {f(yu)}A240 240 0 0 0 194 0",          # north border, leaning right
            f"M86 {f(yd)}A240 240 0 0 0 64 256"]           # south border, leaning left
    s = "".join(f'<path d="{d}" transform="translate({cx-128} {cy-128})" fill="none" stroke="#000" stroke-width="{gap}"/>' for d in cuts)
    return (f'<mask id="{mid}"><rect width="100%" height="100%" fill="#fff"/>{s}</mask>'
            f'<path mask="url(#{mid})" fill="{fill}" d="{circ(cx, cy, Rg)}"/>')

if __name__ == "__main__":
    cells = []
    g = patch_v4(mid="a")
    cells.append(f'<g transform="translate(20 20)">{g}</g>')
    for s, (sx, sy) in ((32, (20, 300)), (16, (70, 308))):
        cells.append(f'<g transform="translate({sx} {sy}) scale({s/256})">{patch_v4(mid="a"+str(s))}</g>')
    cells.append(f'<rect x="110" y="290" width="150" height="150" rx="16" fill="#06080D"/><g transform="translate(125 305) scale({120/256})">{patch_v4(mid="ar", fill="#f4f1ea")}</g>')
    open("sheet-v4.svg", "w").write(doc("".join(cells), 300, 460, "sheet", bg="#ffffff"))
    open("concept-a-v4.svg", "w").write(doc(patch_v4(), title="Bhoogol — Patchwork"))
