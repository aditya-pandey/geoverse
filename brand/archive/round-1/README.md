# Bhoogol logo

**Status:** round 1 proposal. The recommended direction is **B · Pale Blue Dot**; A and C are kept for comparison.
See `overview.png` for everything on one sheet and `presentation.html` for the concept board.

## The idea

One small blue dot caught in a beam of sunlight, the way Voyager photographed the Earth in 1990
(Carl Sagan's "pale blue dot"). The beam runs at 15° from vertical; the same 15° cut appears on the tops of
the b, h and l in the wordmark and on the foot of ग in भूगोल. The app can open the same way: a dot in a
sunbeam that grows into the globe.

## Colours

| Role | HEX | RGB |
|---|---|---|
| Tile (deep navy) | `#13223F` | 19 34 63 |
| Sunbeam (peach) | `#F3C9A8` | 243 201 168 |
| Dot (blue) | `#2A7FE0` | 42 127 224 |
| Wordmark on dark (ivory) | `#F4F1EA` | 244 241 234 |
| App background | `#06080D` | 6 8 13 |

The wordmark on light backgrounds uses the tile navy. On dark backgrounds the Devanagari can take the peach.

## Files

| Folder | Contents |
|---|---|
| `master/` | Symbol (colour, small-size drawing, black, white); Latin wordmark; Devanagari wordmark; horizontal, stacked and bilingual lockups |
| `web/` | `favicon.ico`, `favicon.svg`, 16/32/48 px PNGs, full-bleed app icon (SVG, 180, 192, 512, maskable 512), `site.webmanifest`, `head-snippet.html` |
| `concepts/` | A, B and C in one colour and in colour |
| `source/` | The Python that draws every file. Run `python3 final.py` from `source/` to rebuild the SVGs |

Every file is plain paths: no fonts, live text, masks, filters or gradients.

## Using the logo

- **Clear space:** keep a gap at least the width of the sunbeam (28% of the tile) on every side.
- **Minimum sizes:** below 32 px use `bhoogol-symbol-small.svg`, which has a larger dot. Use the horizontal lockup at
  120 px wide or more and the bilingual lockup at 200 px wide or more. Below those sizes, use the symbol alone.
- **Backgrounds:** the colour lockups go on white, light greys or the app's navy. On photos or busy
  backgrounds, use the one-colour white or black version.
- **One colour:** in the black and white versions the beam is a real cut-out, so the background shows through.
- **Bilingual:** both scripts are drawn at the same stroke weight. Keep the Latin above the Devanagari.

**Don't:**
- recolour the beam or the dot;
- rotate the tile or change the beam angle;
- move the dot off the beam;
- stretch, outline or add shadows to any part;
- set the name in a font instead of using the drawn wordmarks;
- put the colour tile on a mid-blue background where its edge disappears.

## The Devanagari wordmark

भूगोल is drawn from scratch to match the Latin letters: straight bars and circular arcs with a 22-unit
stroke and a 20-unit headline, so it needs no font licence. Its letter structure was checked against
three standard Devanagari typefaces: भ with its open top hook and crossbar, the ू loop and tail, ग, the ो
stroke rising up and to the left, and ल. A fluent reader should still review it before the final files are made.

## Open items

1. Have a fluent Hindi reader check the भूगोल letterforms.
2. Run a professional trademark search on the name and the mark.
3. Wire the icons and logo into the app, rename it from GeoVerse, and build the dot-to-globe opening.

## Note for regenerating PNGs

The skill's `render_png.py` (Chrome backend) does **not overwrite an existing PNG**: it sees the old file and
stops early. Delete the target PNG first, and use absolute output paths.
