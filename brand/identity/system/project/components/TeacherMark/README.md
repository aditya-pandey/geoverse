# TeacherMark

The brand's signature device: a confident marigold pencil mark that points at the one thing that matters. It comes from "mark it on the outline map".

**Kinds:**
- `circle`: ring the answer or the place.
- `underline`: the key phrase in a fact.
- `arrow`: point at a spot, usually with a note.
- `tick`: correct.
- `sparkle`: something new, or a reward.

**Use:**
- **Around text:** wrap it in `.bh-annotate.bh-annotate--circle` (or `--underline`) with a `.bh-annotate__mark` child carrying `data-bh-mark="circle"` and `data-bh-stretch`.
- **Inline:** use `Bhoogol.mark(kind, { size, color })`.
- **Notes** go beside the mark in `.bh-note` (Kalam, `highlight-ink`): two to five lowercase words.

**Rules:**
- One mark per view, always pointing at something.
- Always marigold. On the day theme, keep marks on `surface-raised` or larger than 24px so they hold 3:1.
- Draw on once in `--t-med`; never loop. With reduced motion, show it without drawing.
