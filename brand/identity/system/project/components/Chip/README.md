# Chip

A pill toggle for map layers and filters, with an icon and one word.

- **At rest:** the chip is `surface` with a 2px `line-strong` border.
- **When on** (`aria-pressed="true"`), it inverts to `ink` on `ground`, so it reads in both themes without a new colour.
- **Provide:** a 20px icon (`data-bh-icon` with `data-bh-size="20"`), a one-word label, and `aria-pressed`.
- **Layout:** chips sit in a wrapping row with `space-2` gaps. On phones the row scrolls sideways inside its own container.
- **Don't:** use chips as navigation, which is the tab bar's job, or use them for one-off actions, which is the button's job.
