# Applications

{{img:appicon}}

## App icon and favicon

- **App icon:** the two worlds on `space`, with one marigold sparkle and three star dots. The square is full-bleed, because the platforms round the corners. Files: `bhoogol-app-icon.svg`, plus PNGs at 180 (Apple touch), 192 and 512 (PWA, also maskable).
- **Favicon:** the single eastern world, India side up (`bhoogol-world.svg`, `favicon.ico`). It reads at 16 px.

## Loading screen

`space` ground with the two worlds in the middle, slowly turning. Under them: "Spinning up the world…" in `body`, `ink-muted`. The loading screen hands off to the globe with a 420 ms cross-fade, and the worlds fly up into the logo.

## Share card (1200 × 630)

World confetti on `space`, with the night wordmark top-left. The result goes in `display-xl`, for example "9 of 10", with one teacher's circle around the best answer. Below it: "Can you beat me?" in `hand`. This card is also the Open Graph image for links.

## In the app

These replace the current GeoVerse UI piece by piece:

| Area | Change |
|---|---|
| Top bar | Night wordmark at 28 px tall, search (⌘K), and a sound toggle |
| Globe | `map-ocean` sea, `pol-1`…`pol-6` countries, `map-border` hairlines, labels in Mukta 600 with a `space` halo |
| Country sheet | The Country card component, swiped up from the bottom on phones and docked at the right on desktop |
| Games | Answer option, Score bar, teacher's marks for feedback, and marbles for rewards |
| Bottom bar (phone) | Tab bar: Explore, Play, Tours, Wildlife, You |

## Merchandise and print

- **Stickers:** the symbol and the single world.
- **Tote and T-shirt:** world confetti on the back, the bilingual lockup on the front.
- **Classroom poster:** day theme, a big world with teacher's marks pointing at five places to find.
