{{img:hero}}

**Bhoogol** (भूगोल, say *BHOO-gol*) is a free 3D globe for learning geography. You spin the Earth, tap a country, play a quick game and learn something you'll remember. The identity has one job: make the world feel like a toy you want to pick up, without talking down to anyone.

In Hindi, *bhoo* means Earth and *gol* means round. Put together, the word means "the round Earth", and it is also the everyday Hindi word for geography. The logo takes that literally: the two O's in the middle of the name are two little worlds.

## The idea in one line

**The whole world is round, so go round it.** Every part of the brand is built from round things: worlds, marbles, discs, pills and a hand-drawn loop. They sit on a deep-space ground, with one warm marigold accent pointing at whatever matters.

## Personality

- **Curious.** Asks good questions and lets you find the answer.
- **Playful.** Toy-like and tactile. Things spin, pop and click.
- **Calm.** Unhurried, with nothing shouting at you.
- **Clever.** Real facts and real data, never dumbed down.
- **Warm.** Rooted in India, open to the whole world.

The brand is not childish, not a textbook, and not a sci-fi game.

## Using this system

- **Themes:** there are two, `night` (the default) and `day`. Night is deep space and matches the app's globe view. Day is chalk-white for reading, printing and teaching. Build every screen from the semantic tokens so both themes work: `ground` for the page, `surface` and `surface-raised` for cards and sheets, `ink` and `ink-muted` for text.
- **Marigold:** use `marigold` for the one thing a view is for (a primary button, the selected answer, a teacher's mark). Use it for one or two things per screen, never as a background.
- **Ocean blue:** `ocean` is the logo's blue and the sea on every globe. For blue buttons use `action-blue`, which carries white text at 5:1.
- **Answers:** a correct answer is `mint` with `on-mint` text and a ✓. A wrong answer is `danger` with `on-danger` text and a ✗. Always show the icon, never colour alone.
- **Focus:** keyboard focus is a solid 3px `focus-ring` outline with a 3px offset. It's marigold on night and blue on day.
- **Type:** headings use `display` (Baloo 2), running text uses `text` (Mukta), teacher's notes use `hand` (Kalam), and numbers use `mono` (JetBrains Mono). All four are on Google Fonts, and Baloo 2, Mukta and Kalam also set Devanagari.
- **Shape:** corners are round. Use `radius-pill` for buttons and chips, `radius-m` for cards and `radius-l` for sheets.
- **Spacing:** comes from the 4px scale, `space-1` to `space-8`.
- **Components:** these are CSS classes in `components/bundle.css` (prefix `bh-`). The helpers in `components/bundle.js` (`window.Bhoogol`) draw the logo, worlds, marks and icons as inline SVG that follows `currentColor`. Call `Bhoogol.hydrate()` to fill any `data-bh-*` placeholders.
- **Logo files:** these are in the Logos asset group. Never retype the name in a font; always use the drawn wordmark.

{{img:pattern}}
