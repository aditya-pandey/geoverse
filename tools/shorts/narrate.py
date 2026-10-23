"""Narrate a countdown script with Kokoro (free, open-licence TTS that runs on a CPU).

    python3 tools/shorts/narrate.py tools/shorts/countdowns/smallest-countries.json out/

Writes <id>.voice.wav and <id>.timing.json: when each line starts and ends, and an
estimated time for each word (for the captions). The voice model is downloaded once
from the kokoro-onnx GitHub release into tools/shorts/.voices/ (git ignores it).
"""
import json, pathlib, re, sys, urllib.request
import numpy as np
import soundfile as sf

HERE = pathlib.Path(__file__).parent
MODELS = HERE / '.voices'
REL = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/'
FILES = ['kokoro-v1.0.int8.onnx', 'voices-v1.0.bin']
GAP = 0.22          # breath between lines

# Pronunciation fixes, applied to the phonemes (the captions keep the normal spelling).
# Left side: what the voice engine produces. Right side: what we want it to say.
# A countdown's JSON can add its own under "pronounce".
PRONOUNCE = {
    "bˈuːɡɑːl": "bˈuːɡˌoʊl",      # Bhoogol: BOO-gohl, not "boo-gahl"
    "lˈaɪv hˈɪɹ": "lˈɪv hˈɪɹ",    # "people live here" (the verb, not "live music")
    "lˈaɪv ɪn": "lˈɪv ɪn",
    "lˈaɪv ðˈɛɹ": "lˈɪv ðˈɛɹ",
    "tuːvˈɑːljuː": "tuːvˈɑːluː",   # Tuvalu: too-VAH-loo
    "nˈaʊɹuː": "nɑːˈuːɹuː",       # Nauru: nah-OO-roo
}
SR = 24000


def ensure_models():
    MODELS.mkdir(exist_ok=True)
    for f in FILES:
        p = MODELS / f
        if not p.exists() or p.stat().st_size < 1_000_000:
            print('downloading', f); urllib.request.urlretrieve(REL + f, p)


def trim(a, thresh=0.01):
    """Cut the silence the model leaves around each line, keeping a hair of air."""
    idx = np.where(np.abs(a) > thresh)[0]
    if not len(idx): return a
    s, e = max(0, idx[0] - int(.03 * SR)), min(len(a), idx[-1] + int(.08 * SR))
    return a[s:e]


def word_times(text, t0, dur):
    """Spread words across the line by length; punctuation earns a little pause."""
    words = text.split()
    weight = [len(re.sub(r'[^\w]', '', w)) + 2 + (3 if re.search(r'[,.;:?!]$', w) else 0) for w in words]
    total = sum(weight); t = t0; out = []
    for w, k in zip(words, weight):
        d = dur * k / total
        out.append({'w': w, 't0': round(t, 3), 't1': round(t + d * (0.8 if re.search(r'[,.;:?!]$', w) else 1), 3)})
        t += d
    return out


def main(script_path, out_dir):
    from kokoro_onnx import Kokoro
    ensure_models()
    k = Kokoro(str(MODELS / FILES[0]), str(MODELS / FILES[1]))
    spec = json.loads(pathlib.Path(script_path).read_text())
    out = pathlib.Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    voice, speed = spec.get('voice', 'am_michael'), spec.get('speed', 1.0)
    lang = 'en-gb' if voice.startswith('b') else 'en-us'
    pieces, lines, t = [np.zeros(int(.25 * SR))], [], .25
    for i, line in enumerate(spec['script']):
        pre = line.get('pauseBefore', 0)
        if pre: pieces.append(np.zeros(int(pre * SR))); t += pre
        ph = k.tokenizer.phonemize(line.get('speak', line['say']), lang)
        for bad, good in {**PRONOUNCE, **spec.get('pronounce', {})}.items(): ph = ph.replace(bad, good)
        a, sr = k.create(ph, voice=voice, speed=speed, lang=lang, is_phonemes=True)
        assert sr == SR
        a = trim(a); d = len(a) / SR
        lines.append({**line, 'i': i, 't0': round(t, 3), 't1': round(t + d, 3), 'words': word_times(line['say'], t, d)})
        post = GAP + line.get('pauseAfter', 0)
        pieces += [a, np.zeros(int(post * SR))]; t += d + post
        print(f'{i:2d} {d:5.2f}s  {line["say"]}')
    audio = np.concatenate(pieces)
    sf.write(out / f"{spec['id']}.voice.wav", audio, SR)
    (out / f"{spec['id']}.timing.json").write_text(json.dumps({'dur': round(len(audio) / SR, 3), 'lines': lines}, indent=1))
    print('total', round(len(audio) / SR, 2), 's')


if __name__ == '__main__':
    main(*sys.argv[1:3])
