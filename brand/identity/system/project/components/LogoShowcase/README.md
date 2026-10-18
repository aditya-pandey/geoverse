# LogoShowcase

The logo on its two grounds: `space` (night) and `chalk` (day). Below them are the symbol, the favicon world, the app icon and the one-colour wordmark.

**Logos in code:** draw them with `Bhoogol.wordmark({ height, ink, mono })`, `Bhoogol.devanagari({ height })`, `Bhoogol.twin({ size })` and `Bhoogol.world('east', { size })`. The letters follow `currentColor` unless you pass `ink`. The worlds keep their fixed colours unless `mono` is set.

**In files:** see the Logos asset group.

Clear space is half a world on every side. The wordmark's minimum size is 96px wide; below that, use the single world.
