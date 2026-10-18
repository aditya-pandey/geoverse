# Colour

{{img:palette}}

## The palette

**Deep space, an ocean, two lands and chalk.** Everything else is a supporting role.

| Name | Token | HEX | RGB | Role |
|---|---|---|---|---|
| Space | `space` | #12133A | 18 19 58 | Night ground; ink on day |
| Ocean | `ocean` | #2E6BFF | 46 107 255 | The sea on every world; the brand's blue |
| Mint | `mint` | #3DDC97 | 61 220 151 | The western land; correct answers |
| Marigold | `marigold` | #FFB020 | 255 176 32 | The eastern land; the one accent per view; teacher's marks |
| Chalk | `chalk` | #F7F5EF | 247 245 239 | Day ground; ink on night |

## Proportions

On a typical screen:

- **About 60% ground:** `space` at night, `chalk` by day.
- **About 25% blue:** the globe's ocean, and links.
- **Under 10% mint and marigold together.** Marigold is a spotlight, not a paint.
- **The rest:** `ink-muted`, the lines, and the map's pastels.

## Rules

- **Text:** body text uses `ink` or `ink-muted` on `ground`, `surface` or `surface-raised`. Every pair is at least 5.5:1 in both themes.
- **Primary buttons:** `marigold` with `on-marigold` text (9.7:1) and a `marigold-ledge` underneath.
- **Blue buttons:** `action-blue` with `on-action-blue` (white, 5.1:1). Don't put white text on `ocean`; it sits right at the 4.5:1 limit.
- **Coloured text:** use the `*-ink` tokens, which are made for reading: `link`, `success-ink`, `danger-ink`, `highlight-ink`.
- **Answers:**
  - Correct is `mint` with `on-mint` and a ✓.
  - Wrong is `danger` with `on-danger` and a ✗.
  - The two fills differ in lightness by more than 3:1 as well as hue, so they never rely on red versus green.
- **Keyboard focus:** a solid 3px `focus-ring`. On night it's marigold, 9.7:1 against the ground; on day it's blue, 4.1:1 against the ground.
- **Never:** blue-to-purple gradients, neon glows, or more than one accent fighting for attention.

## Map colours

- **Political map:** six pastels, `pol-1` to `pol-6`, coloured so that no two neighbours match. They sit on `map-ocean`, divided by a hairline `map-border`.
- **Choropleths:**
  - Sequential data uses `seq-1` (low) to `seq-5` (high), a ramp from pale mint to deep sea that also steps in lightness.
  - Data that diverges around a midpoint uses `div-neg-2` … `div-mid` … `div-pos-2`. Danger orange runs through chalk to ocean blue, which reads safely for colour-blind viewers.
- **Selection:** a `marigold` fill (72%) with a `chalk` outline, plus a teacher's circle mark if the moment deserves it. A marigold outline would vanish against the marigold fill.

{{img:maps}}
