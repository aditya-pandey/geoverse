# ScoreBar

A floating pill at the top of a game: points, the current streak, and a row of kanche (marbles) for the rounds in this set.

- **Points:** set in `display` at 800 beside a `star` icon in `highlight-ink`. When the score changes, the number pops (`--ease-pop`).
- **Streak:** set in `success-ink`, in words: "5 in a row". Hide it below 2.
- **Marbles:** one per round. A won round shows its marble in colour (blue for oceans and rivers, mint for countries, marigold for ranges and wonders); a round still to play is greyed (`.is-empty`).

**Provide:** `role="status"` and an `aria-label` that says the whole thing in words.

**Don't:** show a timer and a streak at the same time on phones; pick one.
