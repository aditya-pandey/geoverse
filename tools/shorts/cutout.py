"""Cut characters out of their backgrounds for story videos. Run on your Mac.

    pip3 install "rembg[cpu]" pillow numpy       # once (rembg downloads its model on first run)
    python3 cutout.py assets/chars/raw

Put the images you made in Gemini or ChatGPT in assets/chars/raw/, named after the character
(soldier_es.png, soldier_fr.png, diplomat_es.png, diplomat_fr.png, viceroy_es.png, viceroy_fr.png).
Each one comes out in assets/chars/ with a transparent background, trimmed to the character.
The story page uses these automatically instead of its drawn characters.
Without rembg it keys out a plain green (#00FF00) background instead.
"""
import pathlib, sys
import numpy as np
from PIL import Image


def key_green(img):
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g > 120) & (g > r * 1.35) & (g > b * 1.35)
    alpha = np.where(green, 0, 255).astype(np.uint8)
    out = np.dstack([a.astype(np.uint8), alpha])
    out[..., 1] = np.where(green, out[..., 1], np.minimum(out[..., 1], np.maximum(r, b) + 30))   # tame green spill on edges
    return Image.fromarray(out, "RGBA")


def main(src):
    src = pathlib.Path(src); dst = src.parent
    try:
        from rembg import remove, new_session; session = new_session("isnet-general-use"); how = "rembg"
    except Exception:
        remove = None; how = "green key"
    files = sorted([p for p in src.iterdir() if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")])
    if not files: sys.exit(f"No images in {src}")
    for p in files:
        img = Image.open(p)
        out = remove(img, session=session) if remove else key_green(img)
        box = out.getbbox()
        if box: out = out.crop(box)
        out.thumbnail((900, 900))
        out.save(dst / (p.stem + ".png"))
        print(f"✓ {p.name} → {dst / (p.stem + '.png')}  ({how})")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).parent / "assets" / "chars" / "raw")
