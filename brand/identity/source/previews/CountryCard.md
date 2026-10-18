# CountryCard

The sheet that opens when you tap a country. On phones it slides up from the bottom; on desktop it docks at the right.

**Anatomy:**
- A handle (phones only).
- The flag, the name in `title`, and the local or Hindi name plus the region in `ink-muted`.
- One real fact in `body-l`.
- Three stats in `.bh-stats`: labels in `caption`, values in `data` (JetBrains Mono, tabular).
- Up to three chips linking to layers such as rivers, seas and wildlife.
- Two actions: "Fly there" (primary) and "Compare" (quiet).

**Provide:** the country's flag emoji (content, not decoration), English name, Devanagari or local name, a one-sentence fact that is true and specific, and the three stats with units.

**The underline:** the teacher's underline under the name is the card's one mark. Use it when the card opens from a game or a search; leave it off when browsing.

**Sizing:** the card is `surface` with `radius-l` and `shadow-lift`. Padding is `space-5`, and `space-4` on narrow phones. Maximum width is 400px.

**Don't:** stack more than three stats, or show a fact you can't source.
