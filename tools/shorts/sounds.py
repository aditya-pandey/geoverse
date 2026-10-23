"""Bhoogol Shorts · sound kit. Run once; the WAVs it writes are committed and reused by every video.

    python3 tools/shorts/sounds.py

Brand sound: quiet, tactile, wooden. Marimba, glass marbles (kanche), a breath of air. Never arcade beeps.
Writes audio/bed.m4a (quiz bed, 125 BPM), audio/bed_cine.m4a (country stories) and one-shots: tick, drop, pop, win, whoosh, boom, rise, hit.
"""
import pathlib, wave
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt

SR = 48000
OUT = pathlib.Path(__file__).parent / 'audio'
OUT.mkdir(exist_ok=True)
rng = np.random.default_rng(5)


def hz(m): return 440 * 2 ** ((m - 69) / 12)
def lp(x, f): return sosfilt(butter(2, f, 'low', fs=SR, output='sos'), x)
def hp(x, f): return sosfilt(butter(2, f, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)
def T(d): return np.arange(int(d * SR)) / SR


def marimba(m, dur=1.2, bright=1.0):
    t = T(dur); f = hz(m)
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t / (0.55 * dur))
         + 0.35 * bright * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / 0.08)
         + 0.12 * bright * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t / 0.02))
    return s * np.minimum(1, t / 0.002)


def marble(pitch=1.0, dur=0.35):
    t = T(dur); fs = np.array([2730, 4410, 6120, 7980]) * pitch
    s = sum(np.sin(2 * np.pi * f * t) * np.exp(-t / d) * a for f, d, a in zip(fs, [.09, .05, .03, .02], [1, .6, .4, .25]))
    return (s + hp(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.002) * 0.6) * 0.5


def kick():
    t = T(0.45); f = 46 + 90 * np.exp(-t / 0.035)
    return np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16))


def shaker(d=0.09):
    t = T(d); return bp(rng.standard_normal(len(t)), 5500, 11000) * np.minimum(1, t / .006) * np.exp(-t / .025)


def whoosh(dur=0.5, lo=300, hi=8000):
    n = int(dur * SR); x = rng.standard_normal(n + 2048); out = np.zeros(n); blk = 512
    for i in range(0, n, blk):
        fc = lo * (hi / lo) ** (i / n)
        y = bp(x[i:i + blk + 2048], fc * .7, min(fc * 1.4, SR / 2 - 200))
        out[i:i + blk] = y[2048:2048 + len(out[i:i + blk])]
    t = np.arange(n) / SR
    return out * (t / dur) ** 2.2 * np.clip((dur - t) / .03, 0, 1)


def boom():
    t = T(1.6); f = 38 + 50 * np.exp(-t / 0.08)
    return np.tanh(1.3 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.6)) * 0.9


def mix(dur, parts):
    out = np.zeros((int(dur * SR), 2))
    for sig, t0, g, pan in parts:
        i = int(t0 * SR)
        if i >= len(out): continue
        sig = sig[: len(out) - i]
        l, r = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
        out[i:i + len(sig), 0] += sig * g * l; out[i:i + len(sig), 1] += sig * g * r
    return out


def reverb(st, amt=.28):
    n = int(1.8 * SR); t = np.arange(n) / SR; out = st.copy()
    for ch in (0, 1):
        ir = lp(rng.standard_normal(n) * np.exp(-t / .45), 6000); ir /= np.sqrt((ir ** 2).sum())
        out[:, ch] += amt * fftconvolve(st[:, ch], ir)[: len(st)]
    return out


def write(name, st, peak=.85):
    st = st / (np.abs(st).max() + 1e-9) * peak
    pcm = (st * 32767).astype(np.int16)
    with wave.open(str(OUT / f'{name}.wav'), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print('wrote', name, round(len(st) / SR, 2), 's')


# ---- the quiz bed: D · Bm · G · A at 125 BPM. Still wood and marimba, but with drive:
#      a firmer kick, a wooden clap on 2 and 4, a syncopated bass that ducks under the kick,
#      a bright marimba line in 16ths, and a little wood fill every 4 bars ----
BEAT, DUR = 0.48, 24.0
BAR = 4 * BEAT
chords = [[50, 57, 62, 66, 69, 76], [47, 54, 59, 62, 66, 73], [43, 50, 59, 62, 67, 69], [45, 52, 57, 61, 64, 71]]
roots = [38, 35, 31, 33]


def clap():
    t = T(.22); n = bp(rng.standard_normal(len(t)), 900, 4200)
    env = sum(np.exp(-np.clip(t - d, 0, None) / .006) * (t >= d) for d in (0, .009, .018)) * .5 + np.exp(-t / .07) * (t >= .02)
    body = np.sin(2 * np.pi * 820 * t) * np.exp(-t / .02) * .4
    return (n * env + body) * .7


def woodblock(f=1250):
    t = T(.18); return (np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * f * 2.7 * t)) * np.exp(-t / .03)


def punchy_kick():
    t = T(.4); f = 48 + 120 * np.exp(-t / .03)
    return np.tanh(2.2 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .14)) + hp(rng.standard_normal(len(t)), 2000) * np.exp(-t / .004) * .3


parts = []
nbars = int(DUR / BAR) + 1
for bar in range(nbars):
    t0 = bar * BAR; ch = chords[bar % 4]; root = roots[bar % 4]
    for k in range(4):
        tb = t0 + k * BEAT
        parts.append((punchy_kick(), tb, .5, 0))
        if k in (1, 3): parts.append((clap(), tb, .32, 0))
        parts.append((shaker(.07), tb + BEAT / 2, .13, .25))
        for q in (.25, .75): parts.append((shaker(.04), tb + BEAT * q, .05, -.3))
    # syncopated bass in 8ths, ducking under each kick
    for k, on in enumerate([1, 0, 1, 1, 0, 1, 0, 1]):
        if not on: continue
        t = T(.22); duck = np.clip(((k * BEAT / 2) % BEAT) / .12 + .35, .35, 1)
        b = lp(np.tanh(1.8 * np.sin(2 * np.pi * hz(root) * t)) * np.minimum(1, t / .008) * np.exp(-t / .1), 520)
        parts.append((b, t0 + k * BEAT / 2, .3 * duck, 0))
    # marimba in 16ths, accent on each beat
    tones = [m + 12 for m in ch[1:]] + [ch[1] + 24]
    for k, idx in enumerate([0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 5, 3, 2, 1, 2]):
        parts.append((marimba(tones[idx], .6, 1.1), t0 + k * BEAT / 4, .1 if k % 4 else .15, -.4 if k % 2 else .4))
    # chord stab on the one
    for m in ch[2:5]: parts.append((marimba(m + 12, 1.1, .7), t0, .07, 0))
    # light pad
    t = T(BAR + .1); pad = sum(np.sin(2 * np.pi * hz(m + d) * t + rng.uniform(0, 6)) for m in ch[1:] for d in (-.06, .06))
    parts.append((lp(pad, 1800) * np.minimum(1, t / .15) * np.clip((BAR + .1 - t) / .25, 0, 1) / 14, t0, .5, 0))
    # wood fill to close every 4 bars
    if bar % 4 == 3:
        for j, f in enumerate([1400, 1250, 1100, 950]): parts.append((woodblock(f), t0 + 3 * BEAT + j * BEAT / 4, .22, -.3 + j * .2))
bed = reverb(mix(DUR, parts), .2)
bed *= np.clip(np.arange(len(bed)) / SR / .02, 0, 1)[:, None]
write('bed', bed, .6)

# ---- the cinematic bed (country stories): a slow open from space, then a gentle 90 BPM heartbeat ----
CB = 60 / 90; CDUR = 26.0
parts = []
t = T(CDUR); drone = np.zeros(len(t))
for m, a in ((38, .5), (45, .35), (50, .25)):
    drone += a * (np.sin(2 * np.pi * hz(m) * t) + .3 * np.sin(2 * np.pi * hz(m) * 2.003 * t))
open_env = np.clip(t / 3.5, 0, 1) ** 1.5
drone = lp(drone, 900) * open_env * .5
parts.append((drone, 0, .6, 0))
# high shimmer, fading in over the first seconds
sh = sum(np.sin(2 * np.pi * hz(m) * t + rng.uniform(0, 6)) * (.6 + .4 * np.sin(2 * np.pi * (.1 + i * .05) * t)) for i, m in enumerate([81, 86, 88, 93]))
parts.append((lp(sh, 7000) * np.clip(t / 5, 0, 1) * np.clip((CDUR - t) / 3, 0, 1) / 10, 0, .35, 0))
# chords from the reveal on
cch = [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 59, 62, 67], [45, 52, 57, 61, 64]]
k = 0; tt = 3.9
while tt < CDUR - 1:
    ch = cch[k % 4]; d = 2 * 4 * CB / 2  # two beats per half bar → one chord per bar of 4
    tp = T(4 * CB + .6); pad = sum(np.sin(2 * np.pi * hz(m + dd) * tp + rng.uniform(0, 6)) for m in ch for dd in (-.08, .08))
    parts.append((lp(pad, 2200) * np.minimum(1, tp / .5) * np.clip((4 * CB + .6 - tp) / .6, 0, 1) / 9, tt, .55, 0))
    for b in range(4):
        parts.append((kick() * .8, tt + b * CB, .28, 0))
    for j, m in enumerate([ch[2] + 24, ch[3] + 24, ch[4] + 12, ch[3] + 24]):
        parts.append((marimba(m, 1.6, .8), tt + j * CB + (CB / 2 if j % 2 else 0), .09, -.4 + j * .25))
    tt += 4 * CB; k += 1
cine = reverb(mix(CDUR, parts), .45)
write('bed_cine', cine, .6)

# ---- one-shots ----
write('tick', reverb(mix(.6, [(marimba(86, .5, 1.2), 0, 1, 0), (marble(1.3, .2), 0, .25, 0)]), .15), .7)
write('drop', reverb(mix(.6, [(marble(1.0), 0, 1, -.2), (marble(1.12), .045, .7, .2)]), .2), .6)
write('pop', reverb(mix(1.2, [(marimba(81, 1.0), 0, 1, -.2), (marimba(86, 1.0), .07, .8, .2), (marble(1.2), 0, .5, 0)]), .25), .75)
write('win', reverb(mix(1.8, [(marimba(m, 1.4), i * .07, 1, -.4 + i * .27) for i, m in enumerate([74, 78, 81, 86])] + [(marble(1.0), 0, .6, 0), (marble(1.12), .06, .5, 0)]), .3), .85)
write('whoosh', mix(.55, [(whoosh(.5), 0, 1, 0)]), .55)
write('boom', reverb(mix(2.0, [(boom(), 0, 1, 0), (marble(1.0), .02, .35, -.3), (marble(1.12), .08, .3, .3)]), .3), .9)
# a rising breath into a reveal, and a deep cinematic hit with a marimba chord on top
t = T(1.6); rise = whoosh(1.6, 120, 6000) + lp(rng.standard_normal(len(t)), 300) * (t / 1.6) ** 3 * .6
write('rise', mix(1.6, [(rise, 0, 1, 0)]), .6)
write('hit', reverb(mix(3.0, [(boom(), 0, 1, 0), (boom(), .01, .6, 0)] + [(marimba(m, 2.4, .7), .02, .5, -.3 + i * .3) for i, m in enumerate([62, 69, 74])]), .5), .9)

# ---- the countdown bed: bright and curious, 112 BPM in D. Pizzicato plucks, a bouncy marimba line,
#      finger snaps and a soft kick; a glockenspiel joins in the middle. About 86 s, long enough for a countdown ----
def pluck(m, dur=.28):
    t = T(dur); f = hz(m)
    s = sum(np.sin(2 * np.pi * f * k * t) / k ** 1.3 for k in range(1, 7)) * np.exp(-t / .07)
    return lp(s * np.minimum(1, t / .002), 3200)


def snap():
    t = T(.12); return bp(rng.standard_normal(len(t)), 2200, 7000) * np.exp(-t / .012) + np.sin(2 * np.pi * 1800 * t) * np.exp(-t / .006) * .3


def glock(m, dur=1.6):
    t = T(dur); f = hz(m)
    return (np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / .15)) * np.exp(-t / .5) * np.minimum(1, t / .001)


def soft_kick():
    t = T(.35); f = 50 + 70 * np.exp(-t / .03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .12)


B_ = 60 / 112; BR = 4 * B_; NB = 40
prog_ = [([50, 54, 57], 38), ([45, 49, 52], 33), ([47, 50, 54], 35), ([43, 47, 50], 31)]     # D  A  Bm  G
motif = [[0, None, 2, 1, 0, None, 4, None], [2, None, 1, 2, 4, None, 2, None], [0, 1, 2, None, 4, 2, 1, None], [4, None, 2, None, 1, 0, None, None]]
parts = []
for bar in range(NB):
    t0 = bar * BR; ch, root = prog_[bar % 4]; sec = 'intro' if bar < 4 else 'B' if 20 <= bar < 28 else 'A'
    tones = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24, ch[1] + 24]
    for k, idx in enumerate([0, 2, 3, 2, 1, 2, 3, 4]):                     # pizzicato 8ths
        parts.append((pluck(tones[idx]), t0 + k * B_ / 2, .16 if k % 2 else .2, -.35 if k % 2 else .35))
    for k in range(4):
        parts.append((snap(), t0 + k * B_, .22 if k in (1, 3) else 0, .1))
        if sec != 'intro':
            if k in (0, 2): parts.append((soft_kick(), t0 + k * B_, .32, 0))
            parts.append((shaker(.05), t0 + k * B_ + B_ / 2, .05, -.25))
    if sec != 'intro':
        for k, at in enumerate((0, 2, 3.5)):                                 # walking pluck bass
            parts.append((pluck(root, .4) * 1.4, t0 + at * B_, .28, 0))
        mel = motif[(bar // 2) % 4] if (bar % 2 == 0) else motif[(bar // 2 + 1) % 4]
        for k, idx in enumerate(mel):                                       # bouncy marimba line
            if idx is None: continue
            parts.append((marimba(tones[idx] + 12, .7, 1.0), t0 + k * B_ / 2, .1, .2 if k % 2 else -.2))
    if sec == 'B':
        for k, m in enumerate([ch[2] + 36, ch[1] + 36]):
            parts.append((glock(m), t0 + k * 2 * B_, .09, .3))
    if bar % 8 == 0: parts.append((glock(ch[0] + 36, 2.2), t0, .1, 0))
bright = reverb(mix(NB * BR + 1.5, parts), .18)
write('bed_bright', bright, .6)

# the bed is long, so keep it small in the repo
import subprocess
for name in ('bed', 'bed_cine', 'bed_bright'):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(OUT / f'{name}.wav'), '-c:a', 'aac', '-b:a', '192k', str(OUT / f'{name}.m4a')], check=True)
    (OUT / f'{name}.wav').unlink()
