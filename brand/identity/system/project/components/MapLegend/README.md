# MapLegend

A small floating legend for data maps (choropleths and 3D bars).

- **Sequential data** (more is more): `seq-1` … `seq-5`. Use this for population density, area, GDP per person and similar.
- **Diverging data** (above and below a midpoint): `div-neg-2` … `div-mid` … `div-pos-2`. Use this for change over time, or difference from the world average.
- **Ticks** are set in `data` (mono, tabular). The title is the measure plus its unit, with the year when it matters.

**Provide:** the title, the class breaks as tick labels, and which ramp to use. Both ramps step in lightness, so they still work in greyscale and for colour-blind viewers.

**Placement:** bottom left of the globe on desktop; above the tab bar on phones, collapsed to the ramp alone.
