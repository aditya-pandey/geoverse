# Toast

A short message that slides up, stays about 2.6 seconds, and leaves on its own.

**Tones:**
- Default is information.
- `--success` puts a mint disc behind the icon.
- `--danger` puts a danger disc behind a ✕ and uses `role="alert"`.
- `--reward` shows the new kancha itself.

**Provide:** one sentence in the brand voice and an icon. Waiting messages end with "…". Never include an emoji.

**Placement:** at the bottom centre on phones, 16px above the tab bar, and at the bottom left on desktop. One toast at a time; a new one replaces the old.

**Don't:** use a toast for something the user must act on. That needs a sheet or a button.
