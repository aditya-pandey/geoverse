# Button

Round, chunky buttons that press down onto a 4px ledge, like the key of a toy.

- **Primary** (`.bh-btn--primary`, marigold) is the one thing the view is for: "Fly there", "Start", "Play again". Use it at most once per view.
- **Blue** (`.bh-btn--blue`, `action-blue` + white) is for a strong second action such as "Compare" or "Next".
- **Default** (`.bh-btn`, `surface-raised`) is for everyday actions such as "Share" and "Layers".
- **Quiet** (`.bh-btn--quiet`, outline only) is for ways out: "Skip", "Cancel", "Not now".
- **Modifiers:** `--icon` makes a 48 × 48 round button and needs an `aria-label`. `--small` makes a 36px button for dense rows.

**What you provide:** the label (verb first, sentence case, 1–3 words), an optional leading icon (`<span data-bh-icon="…">`), and `type="button"`.

**Behaviour:** pressing moves the button down 3px onto its ledge in `--t-fast`. Keyboard focus is a 3px `focus-ring` outline. Disabled buttons fade to 45% and lose the press.

**Don't:** put two primary buttons side by side, write labels in all caps, or use marigold for destructive actions (use `danger`).
