# Making a countdown on a Mac

One-time setup (about 10 minutes):

```sh
brew install node ffmpeg python@3.12          # Homebrew: https://brew.sh
cd geoverse/tools/shorts
npm install
npx playwright install chromium
python3 -m venv .venv && source .venv/bin/activate
pip install kokoro-onnx soundfile
```

Each time:

```sh
cd geoverse/tools/shorts && source .venv/bin/activate
python3 narrate.py countdowns/smallest-countries.json out/      # the voice (first run downloads the model, ~120 MB)
node countdown.mjs countdowns/smallest-countries.json --still 3,12,30   # check a few frames in out/
node countdown.mjs countdowns/smallest-countries.json            # the video → out/*.mp4
```

The week's quizzes (run it on Sunday): `npm run week` → 7 quiz videos, the country stories and `out/posts.md` with every caption.
