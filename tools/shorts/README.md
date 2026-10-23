# Bhoogol Shorts

Vertical quiz videos (1080×1920, 30 fps, with sound) for YouTube Shorts and Instagram Reels, made from Bhoogol's own data. Running it needs no AI and costs nothing.

## Every week, on its own

`.github/workflows/shorts.yml` runs every **Sunday at 06:00 IST**. It makes the next 7 days of videos and publishes them as a release called **"Shorts · week of …"**. Each release has the MP4s plus the title, caption and hashtags for each one, so you can download and post straight from your phone.

To make some right now: **Actions → Bhoogol Shorts → Run workflow**. You can pick a start date and a count.

## On your computer

```sh
cd tools/shorts
npm install
npx playwright install chromium        # once
node make.mjs                          # the next 7 days
node make.mjs --start 2026-11-01 --count 14
node make.mjs --date 2026-10-27        # just one day
node make.mjs --still 1,6,12           # quick look: a few frames per video, no MP4
node make.mjs --stories                # also a country story for each Guess video
node make.mjs --story ISL,CHL --only-stories
node make.mjs --site bhoogol.in        # your own domain in the videos and captions
node episodes.mjs 2026-10-26 30        # print a month of questions without rendering
```

You'll need Node 20 or newer and `ffmpeg`. Output goes to `tools/shorts/out/` (git ignores it).

## What it makes

The formats rotate daily:

| Format | Length | Source |
|---|---|---|
| **Rank these 4** | ~12 s | World Bank figures from `data/daily/`. Topics rotate: area, rain, life expectancy, forest, population, neighbours |
| **Guess the country** | ~15 s | `data/stories.json`: the story's hook, its first self-contained line that doesn't name the country, then the region |
| **This or that** | ~10 s | Same figures, picking pairs where the bigger-looking country loses |
| **Country story** (bonus) | ~22 s | Cinematic follow-up to each Guess video: a push-in from space, the country, then its land, people and surprise from `data/stories.json`. Numbers in lakh and crore become millions and billions |

How the questions are chosen:

- **Deterministic.** A date always gives the same video, so re-running never changes anything and no state file is needed.
- **No spoilers.** It never reuses a Daily Bhoogol line-up.
- **Reviewed stories first.** In "Guess the country", reviewed stories come before drafts, and `posts.md` flags any draft so you can glance at the clues before posting.
- **India's boundary.** India is drawn with the official Survey of India boundary (`data/india-official.geojson`), as in the app.

## Files

| File | What it does |
|---|---|
| `episodes.mjs` | Decides what each day asks |
| `short.html` | The animation: brand globe (d3 orthographic), cards, teacher's marks, outro. Driven frame by frame with `seek(t)` |
| `make.mjs` | Renders frames in headless Chromium, pipes them to ffmpeg, and mixes the music bed plus sound effects at the moments the page reports |
| `sounds.py` | Makes the sound kit in `audio/`. Run it only to change the sounds |

## Changing things

- **A new format:** add a `build…` function in `short.html` and a generator in `episodes.mjs`.
- **New topics:** anything you add to `data/daily/` or `data/stories.json` gets picked up automatically.

## Countdowns (narrated "top 5" videos)

A longer, narrated format: a satellite globe flies to each country, then a notebook page shows the facts with a tilting flag card, handwritten notes and a drawn comparison. Captions follow the narration word by word.

```sh
pip install kokoro-onnx soundfile              # once; the free voice model downloads itself on first run
python3 narrate.py countdowns/smallest-countries.json out/
node countdown.mjs countdowns/smallest-countries.json            # → out/bhoogol-countdown-smallest-countries.mp4
node countdown.mjs countdowns/smallest-countries.json --still 4,12,30   # quick look
```

Each countdown is a JSON file in `countdowns/`. It holds the script (one line per beat), the five countries, and the sources for every number. The voice is Kokoro's `am_michael` (open licence). The globe uses NASA's Blue Marble imagery (`assets/earth-blue-marble.jpg`, public domain).

Facts in a countdown are checked by hand before it's made, so countdowns aren't part of the weekly automation.
