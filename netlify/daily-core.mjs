// Daily Bhoogol scoreboard: the request logic, with the store passed in, so tests can run it without Netlify.
export const EPOCH_UTC = Date.UTC(2026, 9, 18); // Bhoogol #1
const MAX = 300, STEP = 10, BUCKETS = MAX / STEP + 1;
const PER_NETWORK = 6; // a family or classroom shares one address; more than this a day is a script

const cache = new Map(); // n → { at, body } — a warm function answers GETs from memory for a few seconds

// Which puzzle numbers are "today" somewhere on Earth (UTC−12 … UTC+14)
export function liveNumbers(now = Date.now()) {
  const n = (t) => Math.floor((t - EPOCH_UTC) / 864e5) + 1;
  return new Set([n(now - 12 * 36e5), n(now), n(now + 14 * 36e5)]);
}

export function validScore(score) {
  return Number.isInteger(score) && score >= 0 && score <= MAX && score % STEP === 0;
}

async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function tally(store, n) {
  const hist = new Array(BUCKETS).fill(0);
  const { blobs } = await store.list({ prefix: `s/${n}/` });
  for (const b of blobs) {
    const score = parseInt(b.key.split("/")[2], 10);
    if (validScore(score)) hist[score / STEP]++;
  }
  return { n, count: hist.reduce((a, b) => a + b, 0), hist };
}

// The whole request, with the store and address passed in, so it can be tested without Netlify
export async function handle(req, store, ip = "", now = Date.now()) {
  const json = (body, status = 200, maxAge = 0) => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store" },
  });

  if (req.method === "GET") {
    const n = parseInt(new URL(req.url).searchParams.get("n"), 10);
    if (!Number.isInteger(n) || n < 1) return json({ error: "bad n" }, 400);
    const hit = cache.get(n);
    if (hit && now - hit.at < 15000) return json(hit.body, 200, 15);
    const body = await tally(store, n);
    cache.set(n, { at: now, body });
    return json(body, 200, 15);
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);
  let data;
  try { data = await req.json(); } catch (e) { return json({ error: "bad body" }, 400); }
  const n = data?.n, score = data?.score, device = String(data?.device || "");
  if (!liveNumbers(now).has(n)) return json({ error: "not today" }, 400);
  if (!validScore(score)) return json({ error: "bad score" }, 400);
  if (!/^[a-z0-9]{12,40}$/i.test(device)) return json({ error: "bad device" }, 400);

  // one score per device per puzzle; the first one counts
  const seen = await store.get(`u/${n}/${device}`);
  if (!seen) {
    const net = `i/${n}/${await sha(`${ip}|${n}|bhoogol`)}`;
    const used = parseInt((await store.get(net)) || "0", 10);
    if (used >= PER_NETWORK) return json({ error: "too many" }, 429);
    await store.set(net, String(used + 1));
    await store.set(`u/${n}/${device}`, String(score));
    await store.set(`s/${n}/${String(score).padStart(3, "0")}/${device}`, "1");
  }
  const body = await tally(store, n);
  cache.set(n, { at: now, body });
  return json(body);
}

