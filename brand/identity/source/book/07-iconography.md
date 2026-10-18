# Iconography

{{img:icons}}

The icons are a small, custom, rounded line set drawn for Bhoogol.

- **Grid:** 24 × 24 with a 2 px live area margin.
- **Stroke:** 2 px, with round caps and round joins, matching the wordmark's round ends.
- **Ink:** inline icons use `currentColor`, so they take the text colour around them (`ink`, `ink-muted`, or `on-marigold` inside a primary button). The SVG files in the Icons group are drawn in `space` (#12133A).
- **Sizes:** 20 px in chips and dense lists, 24 px everywhere else, 28 px in the tab bar. Don't scale them between sizes.
- **Never filled:** the only filled detail is a 1-unit dot such as the "?" dot.

## The set

| Icon | Meaning |
|---|---|
| `globe` | Explore, the globe view |
| `play` | Games (arcade) |
| `quiz` | A question or a quiz |
| `tour` | Story tours |
| `wildlife` | Animals and plants |
| `compare` | Compare two places (two overlapping worlds) |
| `layers` | Map layers |
| `river` · `mountain` · `ocean` · `capital` | Geography layers |
| `mark` | Circle it: pinpoint games, "you are here" |
| `star` | Score |
| `search` | Search (⌘K) |
| `sound` · `settings` · `share` | Utility |

- **Inline:** `Bhoogol.icon('globe')` returns the SVG.
- **Placeholders:** in markup, `<span data-bh-icon="globe"></span>` is filled by `Bhoogol.hydrate()`.
- **New icons:** draw them on the same grid with the same stroke. Don't mix in another icon library.
