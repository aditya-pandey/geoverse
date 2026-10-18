"""Build Bhoogol's terrain textures from NASA imagery (run once; outputs are committed).

  biome.jpg  — Blue Marble classified into soft, flat biome colours (snow, ice, rock,
               forest, grass, steppe, dry, sand, tundra, lakes) — the clean "toy" terrain look.
  relief.png — GEBCO_08 land elevation (NASA Earth Observatory), 2048×1024, for relief shading.

Sources (both NASA, public domain):
  · Blue Marble colour mosaic, e.g. https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg
  · GEBCO_08 land elevation, NASA Earth Observatory:
    https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73934/gebco_08_rev_elev_21600x10800.png
Needs: Pillow, numpy.
Usage: python3 tools/build_textures.py <blue-marble.jpg> <gebco.png> data
"""
import sys

import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None
BM, GEBCO, OUT = sys.argv[1:4]
W, H = 2048, 1024

# ── elevation: average-downsample the 21600×10800 original (keeps peaks smooth, not aliased)
g = Image.open(GEBCO).convert("L")
g = g.reduce(5)                                   # 4320×2160, box filter
elev = g.resize((W, H), Image.LANCZOS)
e = np.asarray(elev, dtype=np.float32) / 255.0   # 0 = sea level / ocean, 1 = highest
relief = elev.filter(ImageFilter.GaussianBlur(0.8))
relief.save(f"{OUT}/relief.png", optimize=True)

# ── colour: Blue Marble at the same grid
bm = np.asarray(Image.open(BM).convert("RGB").resize((W, H), Image.LANCZOS), dtype=np.float32)
r, gch, b = bm[..., 0], bm[..., 1], bm[..., 2]
lum = (r + gch + b) / 3
sat = bm.max(axis=2) - bm.min(axis=2)
lat = np.abs(90 - (np.arange(H) + 0.5) / H * 180)[:, None] * np.ones((1, W))

BIOME = {  # soft, slightly desaturated — reads as a friendly physical map, not a photo
    "ice": (238, 243, 247), "snow": (226, 232, 236), "rock": (160, 150, 138),
    "forest": (104, 150, 96), "grass": (156, 192, 118), "steppe": (196, 192, 138),
    "dry": (212, 182, 134), "sand": (232, 210, 160), "tundra": (176, 188, 168),
    "water": (88, 140, 184),
}
out = np.zeros((H, W, 3), dtype=np.float32)
done = np.zeros((H, W), dtype=bool)

def paint(mask, key):
    m = mask & ~done
    out[m] = BIOME[key]
    done[m] = True

slat = (90 - (np.arange(H) + 0.5) / H * 180)[:, None] * np.ones((1, W))  # signed latitude
bright = (lum > 170) & (sat < 45)                            # bright & colourless = ice or snow
# ice sheets are thick (Greenland, Antarctica sit 1–3 km up); October snow on Siberian/Canadian lowlands is not ice
paint(bright & ((e > 0.1) | (slat < -55)), "ice")
paint(bright & (slat > 45), "tundra")
paint((b > r * 1.08) & (b > gch * 0.98) & (lum < 120), "water")  # lakes & wetlands (dark blue)
paint(e > 0.55, "rock")                                      # high ground
paint((e > 0.42) & (lum > 150), "snow")                      # bright high ground = snowfields
paint((gch >= r) & (gch > b) & (lum < 72), "forest")
paint((gch >= r) & (gch > b), "grass")
paint((r > gch * 1.1) & (lum > 125), "sand")
paint(r > gch * 1.1, "dry")
paint(lat > 55, "tundra")
paint(np.ones_like(done), "steppe")

img = Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGB").filter(ImageFilter.GaussianBlur(1.2))
img.save(f"{OUT}/biome.jpg", quality=84, optimize=True, progressive=True)

shares = {k: round(float(np.mean(np.all(out == v, axis=2))), 3) for k, v in BIOME.items()}
print("biome.jpg + relief.png written", (W, H))
print("share of map by class (incl. ocean pixels, which the land shader never samples):", shares)
