# Typography

There are four families, each with one job. All of them are free on Google Fonts, and the three that people read in sentences also set Devanagari, so Hindi never falls back to a system font.

| Family | Token | Job | Scripts |
|---|---|---|---|
| **Baloo 2** | `display` | Headlines, big numbers, button labels | Latin, Devanagari |
| **Mukta** | `text` | Body copy, UI text, labels on the globe | Latin, Devanagari |
| **Kalam** | `hand` | Teacher's notes beside a mark, one short phrase at a time | Latin, Devanagari |
| **JetBrains Mono** | `mono` | Numbers that line up: populations, areas, scores | Latin |

## The scale

| Style | Size / line | Weight | Use |
|---|---|---|---|
| `display-xl` | 56 / 56 | 800 | Loading screen, share cards |
| `display-l` | 40 / 44 | 800 | Section openers, quiz results |
| `title` | 28 / 32 | 700 | Country names, sheet titles |
| `heading` | 20 / 26 | 700 | Card headings, question text |
| `body-l` | 18 / 28 | 400 | Facts and stories |
| `body` | 16 / 24 | 400 | Default UI text |
| `label` | 14 / 20 | 600 | Buttons, chips, tabs |
| `caption` | 12 / 16 | 500 | Legends and metadata |
| `note` | 20 / 24 | 700 | Handwritten notes (`hand`) |
| `data` | 14 / 20 | 500 | Tabular numbers (`mono`) |

## Rules

- **Sentence case everywhere:** "Fly there", not "Fly There". The only all-caps are country codes (IND, BHR).
- **Numbers:**
  - Use `data` for numbers that sit in columns, with `font-variant-numeric: tabular-nums`.
  - Group thousands with commas in English ("1,428,627,663") and in the Indian system where the reader expects it ("143 crore"). Never mix the two in one view.
- **Headlines:** one weight jump per heading, at most. Baloo 2 at 800 for display and 700 for titles; never lighter than 600.
- **Hand notes:** `hand` is for a two-to-five-word note next to a teacher's mark ("you are here", "try again!"). Never use it for paragraphs or buttons.
- **Devanagari:** Baloo 2 and Mukta set it at the same size as the Latin. Their Devanagari runs larger, so don't shrink it. Leave 1.5× line height, because matras need room above and below.
- **Placeholder text:** the word "Lorem" never ships; use a real place name.
