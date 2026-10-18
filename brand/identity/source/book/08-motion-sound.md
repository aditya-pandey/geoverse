# Motion and sound

**Spin, settle, pop.** The globe spins smoothly, the UI settles gently, and rewards pop once.

## Timing

| Token (CSS) | Value | Use |
|---|---|---|
| `--t-fast` | 140 ms | Hover, press, chip toggles |
| `--t-med` | 240 ms | Sheets, cards, a mark drawing on |
| `--t-slow` | 420 ms | Page changes, the loading hand-off |
| `--ease-settle` | `cubic-bezier(.2, .9, .25, 1)` | Almost everything: fast start, soft landing |
| `--ease-pop` | `cubic-bezier(.34, 1.56, .64, 1)` | Rewards only: a correct answer, a new marble |

These live in `components/bundle.css`, because tokens have no motion family.

## Signature moments

- **The logo:** the two worlds roll in from the sides and settle into the O's, the land turning a few degrees as they land, then the teacher's loop draws once around them. It takes 1.2 s in total and plays only on first launch.
- **Flying to a place:** the globe is one camera flight with a little lift on long hops. Never cut.
- **Correct answer:** the option fills `mint`, the tick draws on, and the score pops (`ease-pop`, 240 ms).
- **Wrong answer:** a small horizontal shake (3 × 4 px over 240 ms), and the right answer is circled.
- **Buttons:** pressing pushes the button down onto its ledge (3 px, 140 ms). It feels like pressing a real key.

## Reduced motion

When `prefers-reduced-motion` is set:

- Flights become cross-fades.
- Marks appear without drawing.
- Shakes and pops turn off.
- The globe stops auto-rotating.

## Sound

Sound is quiet, tactile and wooden, never arcade beeps. Everything is off by default after the first visit, if the user muted it.

- **Correct:** the click of two glass marbles (kanche) touching.
- **Wrong:** a soft wooden *tok*.
- **Flight:** a breath of air, under 400 ms.
- **New marble:** a single marimba note.
