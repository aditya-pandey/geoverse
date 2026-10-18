# AnswerOption

One answer in a quiz: a letter key, the answer, and a state.

**States:**

| State | Markup | Looks like |
|---|---|---|
| Idle | (none) | `surface-raised` with a ledge |
| Selected | `aria-checked="true"` | Marigold border, marigold key |
| Correct | `data-state="correct"` | `mint` with `on-mint` text, a hand-drawn tick, and a small pop (`--ease-pop`) |
| Wrong | `data-state="wrong"` | `danger` with `on-danger` text, a ✕, and a 3-step shake |
| Dimmed | `data-state="dim"` | 50% opacity, for the other options once an answer is revealed |

**Provide:** `role="radio"` inside a `role="radiogroup"`, the letter key (A–D), the answer text, and, after answering, a state icon in `.bh-answer__state`. The state is never colour alone: correct always shows the tick and wrong always shows the ✕.

**Behaviour:**
- Use 2 to 4 options, stacked with `space-3` gaps, full width on phones.
- After an answer, the right option turns correct and the others dim.
- If the player chose wrong, their pick turns wrong, and a teacher's circle may also mark the right answer.
