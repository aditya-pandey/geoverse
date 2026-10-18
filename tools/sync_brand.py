"""Copy the app-facing brand assets from brand/identity/dist (the source of truth) into assets/brand/,
and build the 1200×630 share image. Run from the repo root:  python3 tools/sync_brand.py"""
import os, re, shutil, subprocess, sys

SRC = "brand/identity/dist"
DST = "assets/brand"
os.makedirs(DST, exist_ok=True)
for f in ["logo/bhoogol-wordmark-night.svg", "logo/bhoogol-symbol.svg", "logo/bhoogol-world.svg",
          "logo/bhoogol-bilingual-night.svg", "logo/bhoogol-app-icon.svg",
          "web/favicon.ico", "web/favicon.svg", "web/apple-touch-icon.png", "web/icon-192.png",
          "web/icon-512.png", "web/maskable-512.png"]:
    shutil.copy(f"{SRC}/{f}", f"{DST}/{os.path.basename(f)}")

open(f"{DST}/site.webmanifest", "w").write("""{
  "name": "Bhoogol",
  "short_name": "Bhoogol",
  "description": "A free 3D globe for learning geography.",
  "start_url": "../../",
  "scope": "../../",
  "display": "standalone",
  "background_color": "#12133A",
  "theme_color": "#12133A",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
""")


def inner(path):
    s = open(path).read()
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', s).group(1).split()]
    return s[s.index(">", s.index("<svg")) + 1:s.rindex("</svg>")], vb[2], vb[3]


# share image: world confetti on space, the bilingual night lockup on the left
conf, cw, ch = inner(f"{SRC}/worlds/pattern-confetti.svg")
conf = conf.replace('<rect width="512" height="512" fill="#12133A"/>', "")
lock, lw, lh = inner(f"{SRC}/logo/bhoogol-bilingual-night.svg")
k = 560 / lw
og = ('<rect width="1200" height="630" fill="#12133A"/>'
      + "".join(f'<g transform="translate({x} {y}) scale({s})">{conf.replace("id=", "data-i=")}</g>'
                for x, y, s in ((640, -40, 0.9), (900, 300, 0.8), (520, 380, 0.55)))
      + f'<g transform="translate(70 {315 - lh * k / 2:.1f}) scale({k:.4f})">{lock.replace("id=", "data-l=")}</g>')
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">{og}</svg>'
open(f"{DST}/og-image.svg", "w").write(svg)
render = sys.argv[1] if len(sys.argv) > 1 else None
if render:
    out = os.path.abspath(f"{DST}/og-image.png")
    if os.path.exists(out):
        os.remove(out)                       # the Chrome renderer never overwrites an existing file
    subprocess.run([sys.executable, render, os.path.abspath(f"{DST}/og-image.svg"), "--width", "1200", "--height", "630", "-o", out], check=True)
    os.remove(f"{DST}/og-image.svg")
print("synced", sorted(os.listdir(DST)))
