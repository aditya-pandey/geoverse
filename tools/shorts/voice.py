"""Use your own recorded voice for a countdown, instead of the synthetic one.

    python3 tools/shorts/voice.py tools/shorts/countdowns/smallest-countries.json ~/Downloads/take.m4a
    python3 tools/shorts/voice.py <script.json> take.m4a pickup.m4a      # a second file fixes a few lines
    node tools/shorts/countdown.mjs tools/shorts/countdowns/smallest-countries.json

Read the script top to bottom in one go. If you stumble, pause and say the whole line
again: the last good take of each line wins. Extra files are "pickups": any line found in
a later file replaces the earlier take, so you can redo a line without re-recording everything.

What it does:
  1. cleans the sound (rumble, hiss, harsh S sounds, evens the level)
  2. transcribes it on your computer with Whisper (faster-whisper; the model downloads once)
  3. finds each script line in the recording, keeping your last take
  4. lays the lines out with the same pauses as the synthetic voice, so the globe has time to fly
Writes <id>.voice.wav and <id>.timing.json (the same files narrate.py makes, with real word
timings for the captions) plus <id>.takes.txt, which says what it picked.

Options: --out DIR (default tools/shorts/out) · --model small.en|medium.en · --raw (skip the clean-up)
         --tempo 1.1 (speed up without changing pitch) · --max-pause 0.35 (longest pause kept inside a line)
         --words a.json,b.json (word timings from another transcriber, one file per recording)
"""
import json, pathlib, re, subprocess, sys
from difflib import SequenceMatcher
import numpy as np
import soundfile as sf

HERE = pathlib.Path(__file__).parent
SR = 48000
GAP = 0.25            # breath between lines (a touch more than the synthetic voice; people need it)
LEAD = 0.25
CLEAN = ("highpass=f=80,afftdn=nr=12:nf=-45:tn=1,equalizer=f=220:t=q:w=1:g=-1.5,"
         "equalizer=f=3500:t=q:w=1.2:g=2,deesser=i=0.3,"
         "acompressor=threshold=0.1:ratio=3:attack=8:release=120:makeup=1.5")
TARGET_ACTIVE = 0.075 # loudness of the speech itself (the synthetic voice's level), so the music ducks the same way
MAX_PAUSE = 0.35      # a pause inside a line longer than this gets shortened to it

# ---------- words → comparable tokens (Whisper writes "61", the script says "sixty-one") ----------
ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
SYN = {"kilometres": "kilometers", "kilometre": "kilometer", "km": "kilometers", "metres": "meters", "metre": "meter",
       "m": "meters", "ok": "okay", "bugle": "bhoogol", "bhugol": "bhoogol", "boogle": "bhoogol", "googol": "bhoogol", "bhoogle": "bhoogol"}
DROP = {"and", "the", "a", "an", "uh", "um", "hmm", "er"}


def n2w(n):
    if n < 20: return [ONES[n]]
    if n < 100: return [TENS[n // 10]] + ([ONES[n % 10]] if n % 10 else [])
    if n < 1000: return [ONES[n // 100], "hundred"] + (n2w(n % 100) if n % 100 else [])
    for div, name in ((10 ** 9, "billion"), (10 ** 6, "million"), (1000, "thousand")):
        if n >= div: return n2w(n // div) + [name] + (n2w(n % div) if n % div else [])


def tokens(word):
    w = word.lower().replace("’", "'").replace("²", "")
    w = re.sub(r"(?<=\d),(?=\d{3})", "", w)
    out = []
    for part in re.split(r"[\s\-–—/]+", w):
        m = re.fullmatch(r"\W*(\d+)(?:\.(\d+))?([a-z%]*)\W*", part)
        if m:
            out += n2w(int(m[1]))
            if m[2]: out += ["point"] + [ONES[int(d)] for d in m[2]]
            if m[3]: out.append({"%": "percent"}.get(m[3], SYN.get(m[3], m[3])))
        else:
            p = re.sub(r"[^a-z0-9]", "", part)
            if p: out.append(SYN.get(p, p))
    return [t for t in out if t not in DROP]


# ---------- transcription ----------
def transcribe(path, model_name, prompt):
    from faster_whisper import WhisperModel
    print(f"transcribing {path.name} with Whisper {model_name} (first run downloads the model)…")
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    # ffmpeg reads the file (Whisper's own reader breaks with newer PyAV versions); Whisper wants 16 kHz mono
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    segs, _ = model.transcribe(np.frombuffer(pcm, dtype=np.float32), language="en", word_timestamps=True, initial_prompt=prompt,
                               vad_filter=True, condition_on_previous_text=False, beam_size=5)
    return [{"w": w.word, "start": w.start, "end": w.end} for s in segs for w in (s.words or [])]


def flatten(words):
    T = []
    for w in words:
        tk = tokens(w["w"])
        if not tk: continue
        step = (w["end"] - w["start"]) / len(tk)
        for i, t in enumerate(tk): T.append((t, w["start"] + i * step, w["start"] + (i + 1) * step))
    return T


# ---------- find each line in the recording ----------
def candidates(S, T):
    """Every place a line seems to start: (start index, match ratio, [(s, t) pairs])."""
    found = []
    for j in range(len(T)):
        if T[j][0] not in S[:2]: continue
        win = [t[0] for t in T[j:j + len(S) + 4]]
        blocks = SequenceMatcher(None, S, win, autojunk=False).get_matching_blocks()
        pairs = [(b.a + k, j + b.b + k) for b in blocks for k in range(b.size)]
        if not pairs or pairs[0][1] != j or pairs[0][0] > 1: continue
        ratio = len(pairs) / len(S)
        if ratio >= 0.6 and (len(S) > 2 or ratio == 1): found.append((j, ratio, pairs))
    takes = []                                     # overlapping windows are the same take: keep the best
    for c in found:
        if takes and c[0] <= takes[-1][2][-1][1]:
            if c[1] > takes[-1][1]: takes[-1] = c
        else: takes.append(c)
    return takes


def place(lines_S, T):
    """For each line, the last good take before the next line begins. Lines not in this file → None."""
    cands = [candidates(S, T) for S in lines_S]
    chosen, pos = [None] * len(lines_S), 0
    for i in range(len(lines_S)):
        mine = [c for c in cands[i] if c[0] >= pos]
        if not mine: continue
        nxt = None
        for m in range(i + 1, min(i + 4, len(lines_S))):
            later = [c[0] for c in cands[m] if c[0] > mine[0][2][-1][1]]
            if later: nxt = min(later); break
        pool = [c for c in mine if nxt is None or c[0] < nxt]
        good = [c for c in pool if c[1] >= 0.8]
        pick = (good or sorted(pool, key=lambda c: c[1]))[-1]
        chosen[i] = {"take": pool.index(pick) + 1, "takes": len(pool), "ratio": pick[1], "pairs": pick[2]}
        pos = pick[2][-1][1] + 1
    return chosen


# ---------- audio ----------
def load(path, raw, tempo=1.0):
    chain = ([] if raw else [CLEAN]) + ([f"atempo={tempo}"] if tempo != 1 else [])   # atempo keeps the pitch
    cmd = ["ffmpeg", "-v", "error", "-i", str(path), *(["-af", ",".join(chain)] if chain else []), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, check=True, capture_output=True).stdout, dtype=np.float32).copy()


def rms_frames(y, hop=int(.01 * SR)):
    n = len(y) // hop
    return np.sqrt((y[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12)


def refine(y, env, floor, t0, t1, lo, hi):
    """Whisper's word times are close, not exact: snap the clip to where the voice really starts and stops."""
    hop = .01
    a, b = int(max(lo, t0 - .3) / hop), int(min(hi, t1 + .5) / hop)
    seg = env[a:b]
    if not len(seg): return t0, t1
    thr = max(seg.max() * .06, floor * 2.5)
    on = np.where(seg > thr)[0]
    if not len(on): return t0, t1
    s, e = (a + on[0]) * hop, (a + on[-1] + 1) * hop
    return max(lo, s - .04), min(hi, e + .1)


def tighten(clip, floor, max_pause):
    """Shorten long pauses inside a line. Returns the clip and a function mapping old clip times to new ones."""
    hop = int(.01 * SR); env = rms_frames(clip, hop)
    if not len(env): return clip, lambda t: t
    quiet = env < max(env.max() * .06, floor * 2.5)
    cuts, k = [], 0                                   # (start, end) in seconds, removed
    while k < len(quiet):
        if not quiet[k]: k += 1; continue
        e = k
        while e < len(quiet) and quiet[e]: e += 1
        if k > 0 and e < len(quiet) and (e - k) * .01 > max_pause:   # only gaps between words, not the edges
            keep = max_pause / 2
            cuts.append((k * .01 + keep, e * .01 - keep))
        k = e
    if not cuts: return clip, lambda t: t
    parts, last = [], 0
    for a, b in cuts: parts.append(clip[last:int(a * SR)]); last = int(b * SR)
    parts.append(clip[last:])
    def remap(t):
        return t - sum(min(b, max(a, t)) - a for a, b in cuts)
    return np.concatenate(parts), remap


def fade(c, i=.012, o=.04):
    c = c.copy(); ni, no = int(i * SR), int(o * SR)
    c[:ni] *= np.linspace(0, 1, ni); c[-no:] *= np.linspace(1, 0, no)
    return c


def word_times(display, S_owner, pairs, T, c0, c1):
    """Caption timing per script word: real times where Whisper heard it, spread evenly where it didn't."""
    known = [None] * len(display)
    for s, t in pairs:
        k = S_owner[s]; a, b = T[t][1], T[t][2]
        known[k] = (min(a, known[k][0]), max(b, known[k][1])) if known[k] else (a, b)
    known = [(max(c0, a), min(c1, b)) if v else None for v in known for a, b in [v or (0, 0)]]
    out, k = list(known), 0
    while k < len(out):
        if out[k] is not None: k += 1; continue
        e = k
        while e < len(out) and out[e] is None: e += 1
        a = out[k - 1][1] if k else c0
        b = out[e][0] if e < len(out) else c1
        if b <= a: b = a + .05 * (e - k)
        wts = [len(re.sub(r"[^\w]", "", display[q])) + 2 for q in range(k, e)]
        tot, t = sum(wts), a
        for q, wt in zip(range(k, e), wts):
            d = (b - a) * wt / tot; out[q] = (t, t + d); t += d
        k = e
    fixed, prev = [], c0                          # captions need words in order, never overlapping
    for a, b in out:
        a = min(max(a, prev), c1); b = min(max(b, a + .04), c1); fixed.append((a, b)); prev = b
    return fixed


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    opt = lambda k, d=None: argv[argv.index("--" + k) + 1] if "--" + k in argv else d
    flag = lambda k: "--" + k in argv
    for v in (opt("out"), opt("model"), opt("words"), opt("tempo"), opt("max-pause")):
        if v in args: args.remove(v)
    tempo, max_pause = float(opt("tempo", 1.0)), float(opt("max-pause", MAX_PAUSE))
    spec = json.loads(pathlib.Path(args[0]).read_text())
    files = [pathlib.Path(a).expanduser() for a in args[1:]]
    if not files: sys.exit("Give the script and at least one recording: voice.py <script.json> take.m4a")
    out = pathlib.Path(opt("out", HERE / "out")); out.mkdir(parents=True, exist_ok=True)
    script = spec["script"]
    display = [l["say"].split() for l in script]
    S_lines, S_owner = [], []
    for words in display:
        S, own = [], []
        for k, w in enumerate(words):
            for t in tokens(w): S.append(t); own.append(k)
        S_lines.append(S); S_owner.append(own)
    names = {w for it in spec.get("items", []) for w in [it["name"]]} | {"Bhoogol", "Central Park", "Manhattan"}
    prompt = ", ".join(sorted(names)) + "."

    best = [None] * len(script)                     # (file index, choice) — later files win
    audio, T_all = [], []
    for fi, f in enumerate(files):
        y = load(f, flag("raw"), tempo); audio.append(y)
        given = opt("words", "").split(",") if opt("words") else []
        words = json.loads(pathlib.Path(given[fi]).read_text()) if fi < len(given) else transcribe(f, opt("model", "small.en"), prompt)
        words = [{**w, "start": w["start"] / tempo, "end": w["end"] / tempo} for w in words]   # Whisper heard the original speed
        T = flatten(words); T_all.append(T)
        for i, ch in enumerate(place(S_lines, T)):
            if ch: best[i] = (fi, ch)
    missing = [i for i, b in enumerate(best) if b is None]
    if missing:
        sys.exit("Couldn't find these lines in the recording:\n" + "\n".join(f"  {i + 1:2d}. {script[i]['say']}" for i in missing)
                 + "\nRecord just those (pause between them) and run again with the extra file at the end.")

    # where each chosen line sits in its recording, then snap to the real voice
    spans = []
    for i, (fi, ch) in enumerate(best):
        T = T_all[fi]; ts = [t for _, t in ch["pairs"]]
        tail = len(S_lines[i]) - 1 - ch["pairs"][-1][0]           # script words Whisper missed at the end
        last = min(ts[-1] + tail, len(T) - 1) if tail else ts[-1]
        spans.append([fi, T[ts[0]][1], T[last][2]])
    report = []
    voice = [np.zeros(int(LEAD * SR), np.float32)]; t = LEAD; lines = []
    for i, (fi, ch) in enumerate(best):
        y = audio[fi]; env = rms_frames(y); floor = np.percentile(env, 20)
        same = [s for s in spans if s[0] == fi]
        lo = max([s[2] for s in same if s[2] <= spans[i][1]] + [0]) + .02
        hi = min([s[1] for s in same if s[1] >= spans[i][2]] + [len(y) / SR]) - .05
        c0, c1 = refine(y, env, floor, spans[i][1], spans[i][2], lo, hi)
        clip, remap = tighten(y[int(c0 * SR):int(c1 * SR)], floor, max_pause)
        clip = fade(clip)
        pre = script[i].get("pauseBefore", 0)
        if pre: voice.append(np.zeros(int(pre * SR), np.float32)); t += pre
        d = len(clip) / SR
        wt = word_times(display[i], S_owner[i], ch["pairs"], T_all[fi], c0, c1)
        lines.append({**script[i], "i": i, "t0": round(t, 3), "t1": round(t + d, 3),
                      "words": [{"w": w, "t0": round(t + min(d, remap(a - c0)), 3), "t1": round(t + min(d, remap(b - c0)), 3)} for w, (a, b) in zip(display[i], wt)]})
        post = GAP + script[i].get("pauseAfter", 0)
        voice += [clip, np.zeros(int(post * SR), np.float32)]; t += d + post
        warn = "   ← check this one, Whisper only matched part of it" if ch["ratio"] < .85 else ""
        report.append(f"{i + 1:2d}. take {ch['take']} of {ch['takes']}{f' in {files[fi].name}' if len(files) > 1 else ''} · "
                      f"{int(c0 // 60)}:{c0 % 60:05.2f} · {d:4.1f}s · {round(ch['ratio'] * 100)}% · {script[i]['say']}{warn}")

    v = np.concatenate(voice)
    env = rms_frames(v, int(.05 * SR)); act = env[env > env.max() * .1]       # level of the speech itself, not the pauses
    if len(act): v = v * (TARGET_ACTIVE / np.sqrt((act ** 2).mean()))
    v = np.tanh(v / .9) * .9                                                  # soft-limit the odd loud syllable instead of turning everything down
    sf.write(out / f"{spec['id']}.voice.wav", v, SR)
    (out / f"{spec['id']}.timing.json").write_text(json.dumps({"dur": round(len(v) / SR, 3), "lines": lines, "voice": "recorded"}, indent=1))
    (out / f"{spec['id']}.takes.txt").write_text("\n".join(report) + "\n")
    print("\n".join(report)); print(f"\n✓ {out / (spec['id'] + '.voice.wav')} · {len(v) / SR:.1f}s\n  now: node countdown.mjs {args[0]}")


if __name__ == "__main__":
    main(sys.argv[1:])
