# SearchField

The ⌘K search panel for every country, river, range and sea.

- **Field:** a 56px row with the `search` icon, the input in `body-l` weight 500, and a `⌘K` keyboard hint (`.bh-kbd`). On phones the hint is hidden.
- **Results:** each row shows a flag (or a layer icon for physical features), the name with the matched letters in `highlight-ink` bold, and the kind in `caption`. The highlighted row uses `aria-selected="true"` on `surface-raised`.
- **Focus:** the whole panel takes the `focus-ring` while typing.
- **Empty state:** No place called "Atlantis". Try a country, river or range.

**Provide:** `role="search"`, a labelled input, `role="listbox"` and `role="option"` rows, plus arrow-key and Enter handling.
