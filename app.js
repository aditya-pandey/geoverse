/* ═══════════════════════════════════════════════════════════
   GEOVERSE — The Living Atlas
   A cinematic 3D geography experience.
   Data: Natural Earth · world-countries · World Bank · Wikipedia
         geoBoundaries (states) · Survey of India (official Indian map)
   ═══════════════════════════════════════════════════════════ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const TEXTURES = {
  day:   "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
  night: "https://unpkg.com/three-globe/example/img/earth-night.jpg",
  dark:  "https://unpkg.com/three-globe/example/img/earth-dark.jpg",
};
const BUMP_URL = "https://unpkg.com/three-globe/example/img/earth-topology.png";
const SKY_URL  = "https://unpkg.com/three-globe/example/img/night-sky.png";

const NE = "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0";

const REGION_COLORS = {
  Africa:    "#f4a261",
  Americas:  "#2a9d8f",
  Asia:      "#e76f51",
  Europe:    "#4db8ff",
  Oceania:   "#c77dff",
  Antarctic: "#9aa5b1",
};

const ADM1_PALETTE = ["#ffd166", "#4db8ff", "#3ddc84", "#c77dff", "#ff9f43", "#7ee0ff", "#f4a261", "#e76f51", "#2a9d8f", "#ff5d73"];

const WIKI_OVERRIDES = {
  "Georgia": "Georgia (country)",
  "Micronesia": "Federated States of Micronesia",
  "Ireland": "Republic of Ireland",
  "DR Congo": "Democratic Republic of the Congo",
  "Palestine": "State of Palestine",
};

const fmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const fmtFull = new Intl.NumberFormat("en");

/* ───────────────────────── STATE ───────────────────────── */
const S = {
  globe: null,
  features: [],
  byCca3: new Map(),
  mode: "explore",
  texture: "day",
  userTexture: "day",
  hoverD: null,
  selected: null,
  flash: new Map(),
  atlasMetric: "population",
  atlas3d: true,
  wb: {},                  // extra World Bank indicator maps (iso3 → value)
  panelTab: "overview",
  panelToken: 0,
  stateView: null,         // { country: feature, adm1: [features] }
  adm1Cache: new Map(),
  visited: new Set(JSON.parse(localStorage.getItem("gv-visited") || "[]")),
  idleTimer: null,
  quiz: null,
  quizType: "find",
  quizRegion: "World",
  statesPromise: null,
  earth: null,             // { marine, regions, lakes, rivers } once loaded
  earthLayers: { oceans: true, regions: true, rivers: true, lakes: false, wonders: true },
  wikiCache: new Map(),
};

/* ───────────────────────── HELPERS ───────────────────────── */
const flagEmoji = (cca2) =>
  cca2 ? String.fromCodePoint(...[...cca2.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : "🏳️";

const nameOf = (d) => d?.gv?.name?.common || d?.properties?.name || d?.properties?.shapeName || "Unknown";

const titleCase = (s) => /[a-z]/.test(s) ? s : s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function centroidOf(d) {
  if (!d._centroid) {
    const [lng, lat] = d3.geoCentroid(d);
    d._centroid = { lat, lng };
  }
  return d._centroid;
}

function viewAltitudeFor(d) {
  const area = d.gv?.area || 500000;
  return Math.min(2.6, Math.max(0.45, Math.sqrt(area) / 3200 + 0.35));
}

function haversine(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearingArrow(a, b) {
  const toR = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * toR) * Math.cos(b.lat * toR);
  const x = Math.cos(a.lat * toR) * Math.sin(b.lat * toR) -
    Math.sin(a.lat * toR) * Math.cos(b.lat * toR) * Math.cos((b.lng - a.lng) * toR);
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const dirs = ["⬆️ north", "↗️ north-east", "➡️ east", "↘️ south-east", "⬇️ south", "↙️ south-west", "⬅️ west", "↖️ north-west"];
  return dirs[Math.round(deg / 45) % 8];
}

function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add("hidden"), ms);
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

async function fetchWiki(title) {
  if (S.wikiCache.has(title)) return S.wikiCache.get(title);
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`);
  if (!r.ok) throw new Error("wiki 404");
  const j = await r.json();
  if (j.type === "disambiguation") throw new Error("ambiguous");
  const out = { extract: j.extract, thumb: j.thumbnail?.source || null, url: j.content_urls?.desktop?.page, title: j.title };
  S.wikiCache.set(title, out);
  return out;
}

async function fetchWikiFirst(titles) {
  for (const t of titles.filter(Boolean)) {
    try { return await fetchWiki(t); } catch (e) { /* try next */ }
  }
  return null;
}

const wikiTitle = (d) => WIKI_OVERRIDES[nameOf(d)] || nameOf(d);

const wikiBlockHtml = (wiki, fallbackMsg = "No encyclopedia entry available.") => wiki
  ? `${wiki.thumb ? `<img class="wiki-thumb" src="${wiki.thumb}" alt="" />` : ""}${wiki.extract}
     <br/><a class="wiki-source" href="${wiki.url}" target="_blank" rel="noopener">Full article: ${wiki.title} →</a>`
  : `<em style="color:var(--text-dim)">${fallbackMsg}</em>`;

/* ───────────────────────── DATA LOAD ───────────────────────── */
function loaderStep(pct, msg) {
  $("#loaderFill").style.width = pct + "%";
  $("#loaderMsg").textContent = msg;
}

async function loadData() {
  loaderStep(10, "Charting the continents…");
  const topo = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json").then((r) => r.json());
  const features = topojson.feature(topo, topo.objects.countries).features;

  loaderStep(40, "Interviewing 195 countries…");
  let countries = [];
  try {
    const [raw, wb] = await Promise.all([
      fetch("https://cdn.jsdelivr.net/npm/world-countries@5.1.0/countries.json").then((r) => r.json()),
      fetch("https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&mrnev=1&per_page=400")
        .then((r) => r.json()).catch(() => null),
    ]);
    const POP_FALLBACK = { TWN: 23894394, ESH: 587000, VAT: 800, FLK: 3800, UNK: 1587000, ATF: 400, SPM: 5800, WLF: 11400, BLM: 10600, MAF: 32500, SJM: 2900, NIU: 1600, TKL: 1900, VGB: 31000, AIA: 15900, MSR: 4400, FRO: 54000, GGY: 64000, JEY: 103000, PCN: 47 };
    const popByIso3 = new Map();
    if (Array.isArray(wb) && Array.isArray(wb[1])) {
      for (const row of wb[1]) if (row.value != null) popByIso3.set(row.countryiso3code, row.value);
      if (popByIso3.has("XKX")) popByIso3.set("UNK", popByIso3.get("XKX"));
    }
    countries = raw.map((c) => ({
      ...c,
      population: popByIso3.get(c.cca3) ?? POP_FALLBACK[c.cca3] ?? null,
      flags: {
        svg: `https://flagcdn.com/${c.cca2.toLowerCase()}.svg`,
        png: `https://flagcdn.com/w320/${c.cca2.toLowerCase()}.png`,
      },
    }));
  } catch (e) {
    toast("⚠️ Live country data unavailable — running in map-only mode");
  }

  const byCcn3 = new Map(countries.map((c) => [c.ccn3, c]));
  const byName = new Map(countries.map((c) => [c.name.common.toLowerCase(), c]));
  const NAME_ALIASES = {
    "united states of america": "united states",
    "dem. rep. congo": "dr congo",
    "congo": "republic of the congo",
    "central african rep.": "central african republic",
    "s. sudan": "south sudan",
    "côte d'ivoire": "ivory coast",
    "bosnia and herz.": "bosnia and herzegovina",
    "dominican rep.": "dominican republic",
    "falkland is.": "falkland islands",
    "eq. guinea": "equatorial guinea",
    "solomon is.": "solomon islands",
    "macedonia": "north macedonia",
    "w. sahara": "western sahara",
    "fr. s. antarctic lands": "french southern and antarctic lands",
  };

  for (const f of features) {
    const rawName = (f.properties.name || "").toLowerCase();
    f.gv = byCcn3.get(String(f.id).padStart(3, "0")) ||
           byName.get(rawName) ||
           byName.get(NAME_ALIASES[rawName]) || null;
    if (f.gv) S.byCca3.set(f.gv.cca3, f);
  }

  S.features = features.filter((f) => f.properties.name !== "Antarctica");

  // Official Survey of India boundary for India (world view)
  loaderStep(68, "Redrawing India, officially…");
  try {
    const ind = await fetch("data/india-official.geojson").then((r) => r.json());
    const indF = S.byCca3.get("IND");
    if (indF && ind.features?.[0]) {
      indF.geometry = ind.features[0].geometry;
      delete indF._centroid;
    }
  } catch (e) { /* keep default boundary */ }

  loaderStep(80, "Polishing the oceans…");
}

/* ───────────────────────── GLOBE STYLING ───────────────────────── */
function polyBaseColor(d) {
  if (S.flash.has(d)) return S.flash.get(d);

  if (d.__adm1) {
    const base = ADM1_PALETTE[d.__idx % ADM1_PALETTE.length];
    return hexA(base, d === S.hoverD ? 0.85 : 0.5);
  }
  if (S.stateView) return "rgba(80,110,160,0.06)";

  if (S.mode === "quiz" && S.quiz) {
    if (d === S.hoverD) return "rgba(255,255,255,0.35)";
    return "rgba(120,170,255,0.10)";
  }
  if (S.mode === "atlas") return atlasColor(d);
  if (S.mode === "earth") return "rgba(120,170,255,0.04)";

  if (d === S.selected) return "rgba(255,209,102,0.65)";
  if (d === S.hoverD) return hexA(REGION_COLORS[d.gv?.region] || "#8fa3c8", 0.6);
  return hexA(REGION_COLORS[d.gv?.region] || "#8fa3c8", 0.28);
}

function polyAltitude(d) {
  if (d.__adm1) return d === S.hoverD ? 0.032 : 0.018;
  if (S.stateView) return 0.004;
  if (S.mode === "atlas") {
    const t = atlasT(d);
    const base = S.atlas3d && t != null ? 0.008 + t * 0.3 : 0.008;
    return d === S.hoverD ? base + 0.012 : base;
  }
  if (S.mode === "earth") return 0.004;
  if (S.mode === "explore" && d === S.selected) return 0.035;
  if (d === S.hoverD && !(S.mode === "quiz" && S.quiz)) return 0.022;
  if (d === S.hoverD) return 0.016;
  // slight lift so the official India overlay never z-fights neighbours it overlaps
  return d.gv?.cca3 === "IND" ? 0.0095 : 0.007;
}

function polyStroke(d) {
  if (d.__adm1) return "rgba(255,240,200,0.9)";
  return "rgba(180,215,255,0.35)";
}

function polyLabel(d) {
  if (S.mode === "earth") return "";
  if (d.__adm1) {
    return `<div class="globe-tip"><div class="gt-name">📍 ${nameOf(d)}</div><div class="gt-sub">${nameOf(S.stateView.country)} · click for the story</div></div>`;
  }
  if (S.stateView) return "";
  if (S.mode === "quiz" && S.quiz && S.quiz.type !== "capital") return "";
  const c = d.gv;
  let sub = c ? `${c.capital?.[0] || "—"} · ${c.population != null ? fmt.format(c.population) + " people" : "population unknown"}` : "";
  if (S.mode === "atlas" && c) sub = atlasTooltip(c);
  return `<div class="globe-tip">
      <div class="gt-name">${c ? flagEmoji(c.cca2) + " " : ""}${nameOf(d)}</div>
      <div class="gt-sub">${sub}</div>
    </div>`;
}

function refreshPolys() {
  S.globe
    .polygonCapColor(polyBaseColor)
    .polygonAltitude(polyAltitude)
    .polygonStrokeColor(polyStroke)
    .polygonLabel(polyLabel);
}

function initGlobe() {
  const el = $("#globeViz");
  S.globe = Globe()(el)
    .width(innerWidth)
    .height(innerHeight)
    .globeImageUrl(TEXTURES.day)
    .bumpImageUrl(BUMP_URL)
    .backgroundImageUrl(SKY_URL)
    .atmosphereColor("#4db8ff")
    .atmosphereAltitude(0.22)
    .polygonsData(S.features)
    .polygonSideColor(() => "rgba(30,60,120,0.18)")
    .polygonsTransitionDuration(280)
    .onPolygonHover((d) => {
      S.hoverD = d;
      el.style.cursor = d && S.mode !== "earth" ? "pointer" : "grab";
      if (S.mode === "atlas") renderAtlasReadout(d);
      refreshPolys();
    })
    .onPolygonClick((d, ev) => handleCountryClick(d, ev))
    // labels layer — used by Earth mode
    .labelLat((l) => l.lat)
    .labelLng((l) => l.lng)
    .labelText((l) => l.text)
    .labelSize((l) => l.size)
    .labelColor((l) => l.color)
    .labelDotRadius(0.22)
    .labelAltitude(0.008)
    .labelResolution(2)
    .labelLabel((l) => `<div class="globe-tip"><div class="gt-name">${l.emoji || ""} ${titleCase(l.text)}</div><div class="gt-sub">${l.kind} · click to learn</div></div>`)
    .onLabelClick((l) => openEarthFeature(l))
    .onLabelHover((l) => { el.style.cursor = l ? "pointer" : "grab"; })
    // paths layer — rivers
    .pathPoints((p) => p.pts)
    .pathPointLat((pt) => pt[0])
    .pathPointLng((pt) => pt[1])
    .pathColor(() => "rgba(110,205,255,0.65)")
    .pathDashLength(0.35)
    .pathDashGap(0.15)
    .pathDashAnimateTime(24000)
    .pathLabel((p) => `<div class="globe-tip"><div class="gt-name">💧 ${p.name}</div><div class="gt-sub">river · click to learn</div></div>`)
    .onPathClick((p) => openEarthFeature({ text: p.name, kind: "river", emoji: "💧" }))
    .onPathHover((p) => { el.style.cursor = p ? "pointer" : "grab"; })
    // html layer — natural wonders
    .htmlLat((w) => w.lat)
    .htmlLng((w) => w.lng)
    .htmlAltitude(0.012)
    .htmlElement((w) => {
      const div = document.createElement("div");
      div.className = "wonder-pin";
      div.textContent = w.emoji;
      div.title = w.name;
      div.onclick = (e) => { e.stopPropagation(); openEarthFeature({ text: w.name, kind: w.kind, emoji: w.emoji, wiki: w.wiki, lat: w.lat, lng: w.lng }); };
      return div;
    })
    .onGlobeClick(() => {
      if (S.stateView) return exitStateView();
      if (S.mode === "explore") closePanel();
    });

  refreshPolys();
  S.globe.pointOfView({ lat: 12, lng: 25, altitude: 4.5 });

  const controls = S.globe.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.42;
  controls.enableDamping = true;

  el.addEventListener("pointerdown", () => pauseRotate());
  // double-click on empty space (ocean / stars) resets the zoom to the normal world view
  el.addEventListener("dblclick", () => {
    if (S.hoverD) return; // double-clicking a country keeps its normal meaning
    const cur = S.globe.pointOfView();
    S.globe.pointOfView({ lat: cur.lat, lng: cur.lng, altitude: 2.4 }, 900);
    pauseRotate();
  });
  addEventListener("resize", () => S.globe.width(innerWidth).height(innerHeight));
}

function pauseRotate() {
  S.globe.controls().autoRotate = false;
  clearTimeout(S.idleTimer);
  S.idleTimer = setTimeout(() => {
    if (!S.stateView && (S.mode === "explore" || S.mode === "earth")) {
      const c = S.globe.controls();
      c.autoRotateSpeed = S.selected ? 0.18 : 0.42; // slow "hero orbit" when a country is open
      c.autoRotate = true;
    }
  }, S.selected ? 4000 : 18000);
}

function flyTo(d, ms = 1300, altScale = 1) {
  pauseRotate();
  const { lat, lng } = centroidOf(d);
  S.globe.pointOfView({ lat, lng, altitude: viewAltitudeFor(d) * altScale }, ms);
}

/* ───────────────────────── CINEMATIC FX ───────────────────────── */
const CLOUDS_URL = "https://raw.githubusercontent.com/turban/webgl-earth/master/images/fair_clouds_4k.png";

function initFx() {
  if (!window.THREE) return; // graceful: app works without the FX layer
  S.fx = { lightGoal: 0, seq: 0 };

  // Warm spotlight that blooms over a selected country
  S.fx.light = new THREE.PointLight(0xffd166, 0, 380, 1.6);
  S.globe.scene().add(S.fx.light);

  // Ocean specular glint
  const gm = S.globe.globeMaterial();
  gm.specular = new THREE.Color("#5d9dff");
  gm.shininess = 13;

  // Drifting cloud layer (lazy — 4K texture)
  new THREE.TextureLoader().load(CLOUDS_URL, (tex) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(S.globe.getGlobeRadius() * 1.012, 64, 64),
      new THREE.MeshPhongMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false })
    );
    mesh.visible = S.texture === "day";
    S.fx.clouds = mesh;
    S.globe.scene().add(mesh);
  });

  (function tick() {
    requestAnimationFrame(tick);
    if (S.fx.clouds) S.fx.clouds.rotation.y += 0.00011;
    const l = S.fx.light;
    l.intensity += (S.fx.lightGoal - l.intensity) * 0.055;
  })();
}

function heroLightTo(d) {
  if (!S.fx?.light) return;
  const { lat, lng } = centroidOf(d);
  const p = S.globe.getCoords(lat, lng, 0.45);
  S.fx.light.position.set(p.x, p.y, p.z);
  S.fx.lightGoal = 2.4;
}

function heroLightOff() {
  if (S.fx) S.fx.lightGoal = 0;
}

function ringPulse(lat, lng, maxR = 4, color = "255,209,102") {
  S.globe
    .ringsData([{ lat, lng }])
    .ringLat((r) => r.lat)
    .ringLng((r) => r.lng)
    .ringAltitude(0.005)
    .ringMaxRadius(maxR)
    .ringPropagationSpeed(maxR / 1.1)
    .ringRepeatPeriod(650)
    .ringColor(() => (t) => `rgba(${color},${Math.max(0, 1 - t)})`);
  clearTimeout(ringPulse._t);
  ringPulse._t = setTimeout(() => S.globe.ringsData([]), 2100);
}

// Two-stage camera: rise above the world, then dive onto the country.
function cinematicFlyTo(d) {
  const seq = S.fx ? ++S.fx.seq : 0;
  pauseRotate();
  const { lat, lng } = centroidOf(d);
  const targetAlt = viewAltitudeFor(d);
  const cur = S.globe.pointOfView();
  const cruise = Math.min(3.2, Math.max(cur.altitude, targetAlt + 1.0));
  // camera lands slightly south-east of centre so the country sits clear of the info panel
  const view = { lat: lat - 4, lng: lng + Math.min(9, targetAlt * 5), altitude: targetAlt };

  S.globe.pointOfView({ lat: cur.lat, lng: cur.lng, altitude: cruise }, 420);
  setTimeout(() => {
    if (S.fx && seq !== S.fx.seq) return; // superseded by a newer selection
    S.globe.pointOfView(view, 1450);
  }, 430);
  setTimeout(() => {
    if (S.fx && seq !== S.fx.seq) return;
    ringPulse(lat, lng, Math.max(2.2, Math.min(9, Math.sqrt(d.gv?.area || 3e5) / 260)));
    heroLightTo(d);
    pauseRotate(); // arms the slow hero orbit
  }, 1900);
}

function flash(d, color, ms = 900) {
  S.flash.set(d, color);
  refreshPolys();
  setTimeout(() => { S.flash.delete(d); refreshPolys(); }, ms);
}

/* ───────────────────────── ATLAS MODE ───────────────────────── */
const WB_EXTRA = {
  gdp:   { code: "NY.GDP.MKTP.CD", label: "GDP" },
  gdppc: { code: "NY.GDP.PCAP.CD", label: "GDP per capita" },
  life:  { code: "SP.DYN.LE00.IN", label: "Life expectancy" },
};

const ATLAS_SCALES = {
  population: { get: (c) => c.population, log: true, domain: [8e4, 1.5e9], interp: d3.interpolatePlasma, label: (v) => fmt.format(v) + " people" },
  gdp:        { get: (c) => S.wb.gdp?.get(c.cca3 === "UNK" ? "XKX" : c.cca3), log: true, domain: [1e9, 3e13], interp: d3.interpolateViridis, label: (v) => "$" + fmt.format(v) },
  gdppc:      { get: (c) => S.wb.gdppc?.get(c.cca3 === "UNK" ? "XKX" : c.cca3), log: true, domain: [300, 130000], interp: d3.interpolateCividis, label: (v) => "$" + fmt.format(v) + " /person" },
  life:       { get: (c) => S.wb.life?.get(c.cca3 === "UNK" ? "XKX" : c.cca3), log: false, domain: [55, 88], interp: d3.interpolateRdYlGn, label: (v) => v.toFixed(1) + " years" },
  density:    { get: (c) => (c.area && c.population != null ? c.population / c.area : null), log: true, domain: [1, 1500], interp: d3.interpolateInferno, label: (v) => v.toFixed(0) + " /km²" },
  area:       { get: (c) => c.area, log: true, domain: [1e3, 1.71e7], interp: d3.interpolateTurbo, label: (v) => fmt.format(v) + " km²" },
  region:     { get: (c) => c.region, label: (v) => v },
};

function atlasT(d) {
  const c = d.gv;
  if (!c || S.atlasMetric === "region") return null;
  const m = ATLAS_SCALES[S.atlasMetric];
  const v = m.get(c);
  if (v == null || v <= 0) return null;
  const [lo, hi] = m.domain;
  const t = m.log
    ? (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))
    : (v - lo) / (hi - lo);
  return Math.max(0, Math.min(1, t));
}

function atlasColor(d) {
  const c = d.gv;
  if (!c) return "rgba(120,140,170,0.15)";
  if (S.atlasMetric === "region") {
    return hexA(REGION_COLORS[c.region] || "#8fa3c8", d === S.hoverD ? 1 : 0.85);
  }
  const t = atlasT(d);
  if (t == null) return "rgba(120,140,170,0.15)";
  const col = d3.color(ATLAS_SCALES[S.atlasMetric].interp(t));
  col.opacity = d === S.hoverD ? 1 : 0.88;
  return col.formatRgb();
}

function atlasTooltip(c) {
  const m = ATLAS_SCALES[S.atlasMetric];
  if (S.atlasMetric === "region") return c.region + (c.subregion ? " · " + c.subregion : "");
  const v = m.get(c);
  return v != null ? m.label(v) : "no data";
}

function renderAtlasReadout(d) {
  const box = $("#atlasReadout");
  if (!d || !d.gv) { box.innerHTML = "Hover a country…"; return; }
  box.innerHTML = `${flagEmoji(d.gv.cca2)} <b>${nameOf(d)}</b><br/>${atlasTooltip(d.gv)}`;
}

async function ensureIndicator(key) {
  if (!WB_EXTRA[key] || S.wb[key]) return;
  try {
    const j = await fetch(`https://api.worldbank.org/v2/country/all/indicator/${WB_EXTRA[key].code}?format=json&mrnev=1&per_page=400`).then((r) => r.json());
    const map = new Map();
    if (Array.isArray(j) && Array.isArray(j[1])) for (const row of j[1]) if (row.value != null) map.set(row.countryiso3code, row.value);
    S.wb[key] = map;
  } catch (e) {
    toast(`⚠️ Couldn't load ${WB_EXTRA[key].label} data`);
    S.wb[key] = new Map();
  }
}

async function setAtlasMetric(metric) {
  S.atlasMetric = metric;
  $$(".metric-btn[data-metric]").forEach((x) => x.classList.toggle("active", x.dataset.metric === metric));
  if (WB_EXTRA[metric] && !S.wb[metric]) {
    $("#atlasReadout").innerHTML = `<span class="loading-dots">Fetching ${WB_EXTRA[metric].label} from the World Bank</span>`;
    await ensureIndicator(metric);
    renderAtlasReadout(S.hoverD);
  }
  renderLegend();
  refreshPolys();
}

function renderLegend() {
  const box = $("#legend");
  if (S.atlasMetric === "region") {
    box.innerHTML = `<div class="legend-cats">` +
      Object.entries(REGION_COLORS).filter(([k]) => k !== "Antarctic")
        .map(([k, c]) => `<div class="legend-cat"><span class="legend-dot" style="background:${c}"></span>${k}</div>`).join("") +
      `</div>`;
    return;
  }
  const m = ATLAS_SCALES[S.atlasMetric];
  const stops = d3.range(0, 1.01, 0.1).map((t) => m.interp(t)).join(",");
  box.innerHTML = `
    <div class="legend-grad" style="background:linear-gradient(90deg,${stops})"></div>
    <div class="legend-row"><span>${m.label(m.domain[0])}</span><span>${m.label(m.domain[1])}</span></div>
    <div style="margin-top:6px;opacity:.7">${m.log ? "log scale" : "linear scale"} · World Bank & open data</div>`;
}

/* ───────────────────────── MODES ───────────────────────── */
function setMode(mode) {
  if (mode === S.mode) { if (mode === "quiz" && !S.quiz) $("#quizSetup").classList.remove("hidden"); return; }
  if (S.mode === "quiz") endQuiz(true);
  if (S.mode === "earth") clearEarthLayers();
  exitStateView(false);
  closePanel();
  heroLightOff();

  S.mode = mode;
  $$(".mode-tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  $("#atlasDock").classList.toggle("hidden", mode !== "atlas");
  $("#earthDock").classList.toggle("hidden", mode !== "earth");
  $("#quizSetup").classList.toggle("hidden", mode !== "quiz");
  $("#quizHud").classList.add("hidden");
  $("#quizResult").classList.add("hidden");

  if (mode === "atlas") {
    setTexture("dark", false);
    renderLegend();
    renderAtlasReadout(null);
    $("#hudHint").textContent = "Hover countries to read the data · Click to dive in";
  } else if (mode === "earth") {
    setTexture("day", false);
    $("#hudHint").textContent = "Oceans, rivers, ranges, wonders — click anything glowing";
    enterEarthMode();
  } else if (mode === "explore") {
    setTexture(S.userTexture, false);
    $("#hudHint").textContent = "Drag to spin · Scroll to zoom · Click a country to dive in";
  } else {
    setTexture("dark", false);
    $("#quizBestLabel").textContent = localStorage.getItem("gv-best") || "0";
  }
  refreshPolys();
}

function setTexture(tex, remember = true) {
  S.texture = tex;
  if (remember) S.userTexture = tex;
  S.globe.globeImageUrl(TEXTURES[tex]);
  if (S.fx?.clouds) S.fx.clouds.visible = tex === "day"; // clouds only over the daylight earth
  $$(".tex-btn").forEach((b) => b.classList.toggle("active", b.dataset.tex === tex));
}

/* ───────────────────────── COUNTRY SELECTION ───────────────────────── */
function handleCountryClick(d, ev) {
  if (!d) return;
  if (d.__adm1) return openStatePanel(d);
  if (S.stateView) { exitStateView(false); selectCountry(d); return; }
  if (S.mode === "earth") return;
  if (S.mode === "quiz" && S.quiz) return quizMapClick(d, ev);
  selectCountry(d);
}

function selectCountry(d) {
  if (S.mode === "quiz" || S.mode === "earth") setMode("explore");
  S.selected = d;
  S.panelTab = "overview";
  refreshPolys();
  cinematicFlyTo(d);
  markVisited(d);
  openPanel(d);
}

function markVisited(d) {
  const key = d.gv?.cca3 || nameOf(d);
  if (!S.visited.has(key)) {
    S.visited.add(key);
    localStorage.setItem("gv-visited", JSON.stringify([...S.visited]));
    updateProgress();
    if (S.visited.size === 10) toast("🌟 10 countries explored — you're on a roll!");
    if (S.visited.size === 50) toast("🏅 50 countries! Certified globe-trotter.");
    if (S.visited.size === 100) toast("👑 100 countries. Legendary.");
  }
}

function updateProgress() {
  const total = S.features.filter((f) => f.gv).length;
  $("#visitedCount").textContent = S.visited.size;
  $("#totalCount").textContent = total;
  $("#chipFill").style.width = Math.min(100, (S.visited.size / total) * 100) + "%";
}

/* ───────────────────────── PANEL ───────────────────────── */
function openPanel(d) {
  const c = d.gv;
  $("#panel").classList.remove("hidden");
  $("#panelTabs").style.display = "";
  $("#panelHeader").style.setProperty("--flagbg", c?.flags?.svg ? `url('${c.flags.svg}')` : "none");
  $("#panelFlag").src = c?.flags?.svg || "";
  $("#panelFlag").style.display = c?.flags ? "" : "none";
  $("#panelName").textContent = `${c ? flagEmoji(c.cca2) + " " : ""}${nameOf(d)}`;
  $("#panelOfficial").textContent = c?.name?.official || "Territory";
  $$(".ptab").forEach((b) => b.classList.toggle("active", b.dataset.tab === S.panelTab));
  renderPanelTab(d);
}

function closePanel() {
  $("#panel").classList.add("hidden");
  heroLightOff();
  if (S.selected) {
    S.selected = null;
    S.globe.controls().autoRotateSpeed = 0.42;
    refreshPolys();
  }
}

// Generic info panel (states, oceans, rivers, wonders, big ideas)
async function openInfoPanel({ title, subtitle, emoji, wikiTitles, flagUrl }) {
  const token = ++S.panelToken;
  $("#panel").classList.remove("hidden");
  $("#panelTabs").style.display = "none";
  $("#panelHeader").style.setProperty("--flagbg", flagUrl ? `url('${flagUrl}')` : "none");
  $("#panelFlag").style.display = flagUrl ? "" : "none";
  if (flagUrl) $("#panelFlag").src = flagUrl;
  $("#panelName").textContent = `${emoji ? emoji + " " : ""}${title}`;
  $("#panelOfficial").textContent = subtitle || "";
  $("#panelBody").innerHTML = `<div class="wiki-block"><div class="loading-dots">Consulting the archives</div></div>`;
  const wiki = await fetchWikiFirst(wikiTitles);
  if (token !== S.panelToken) return;
  $("#panelBody").innerHTML = `<div class="wiki-block">${wikiBlockHtml(wiki)}</div>`;
}

function statCard(label, value, wide = false) {
  return `<div class="stat-card${wide ? " wide" : ""}"><div class="sc-label">${label}</div><div class="sc-value">${value}</div></div>`;
}

async function renderPanelTab(d) {
  const token = ++S.panelToken;
  const body = $("#panelBody");
  const c = d.gv;
  const tab = S.panelTab;

  if (tab === "overview") {
    const density = c?.area && c.population != null ? (c.population / c.area).toFixed(0) : null;
    const langs = c?.languages ? Object.values(c.languages) : [];
    const curr = c?.currencies ? Object.values(c.currencies).map((x) => `${x.name}${x.symbol ? " (" + x.symbol + ")" : ""}`) : [];
    const borders = (c?.borders || []).map((b) => S.byCca3.get(b)).filter(Boolean);
    body.innerHTML = `
      <div class="stat-grid">
        ${statCard("Capital", c?.capital?.[0] || "—")}
        ${statCard("Population", c?.population != null ? fmt.format(c.population) : "—")}
        ${statCard("Area", c?.area ? fmt.format(c.area) + " km²" : "—")}
        ${statCard("Density", density ? density + " /km²" : "—")}
        ${statCard("Region", c ? `${c.region}${c.subregion ? " · " + c.subregion : ""}` : "—", true)}
      </div>
      ${langs.length ? `<div class="section-h">Languages</div><div class="pill-row">${langs.map((l) => `<span class="pill">${l}</span>`).join("")}</div>` : ""}
      ${curr.length ? `<div class="section-h">Currency</div><div class="pill-row">${curr.map((l) => `<span class="pill gold">${l}</span>`).join("")}</div>` : ""}
      ${borders.length ? `<div class="section-h">Neighbours — click to hop</div><div class="pill-row">${borders.map((b) => `<span class="pill click" data-cca3="${b.gv.cca3}">${flagEmoji(b.gv.cca2)} ${nameOf(b)}</span>`).join("")}</div>` : ""}
      <div class="wiki-block" id="ovWiki"><div class="loading-dots">Reading the encyclopedia</div></div>`;
    $$("#panelBody .pill.click").forEach((p) =>
      p.addEventListener("click", () => selectCountry(S.byCca3.get(p.dataset.cca3))));

    const wiki = await fetchWikiFirst([wikiTitle(d)]);
    if (token !== S.panelToken) return;
    $("#ovWiki").innerHTML = wikiBlockHtml(wiki);
  }

  else if (tab === "geography" || tab === "history") {
    const prefix = tab === "geography" ? "Geography of" : "History of";
    let extraTop = "";
    if (tab === "geography" && c) {
      const facts = [];
      facts.push(c.landlocked ? "🏝️ Landlocked" : "🌊 Has a coastline");
      if (c.latlng) facts.push(`📍 ${c.latlng[0].toFixed(1)}°, ${c.latlng[1].toFixed(1)}°`);
      if (c.idd?.root) facts.push(`📞 ${c.idd.root}${c.idd.suffixes?.length === 1 ? c.idd.suffixes[0] : ""}`);
      if (c.tld?.[0]) facts.push(`🌐 ${c.tld[0]}`);
      extraTop = `
        <div class="pill-row">${facts.map((f) => `<span class="pill">${f}</span>`).join("")}</div>
        <div class="pill-row"><a class="pill click" style="text-decoration:none;color:inherit" href="https://www.google.com/maps/search/${encodeURIComponent(nameOf(d))}" target="_blank" rel="noopener">🗺️ Open in Google Maps</a></div>`;
    }
    body.innerHTML = extraTop + `<div class="wiki-block"><div class="loading-dots">Consulting the archives</div></div>`;
    const wiki = await fetchWikiFirst([`${prefix} ${wikiTitle(d)}`, `${prefix} ${nameOf(d)}`, wikiTitle(d)]);
    if (token !== S.panelToken) return;
    body.querySelector(".wiki-block").innerHTML = wikiBlockHtml(wiki, "No article found for this place.");
  }

  else if (tab === "states") {
    body.innerHTML = `<div class="loading-dots">Mapping the provinces</div>`;
    const states = await getStates(c?.cca2);
    if (token !== S.panelToken) return;
    const hasPolys = !!c?.cca3;
    if ((!states || !states.length) && !hasPolys) {
      body.innerHTML = `<p style="color:var(--text-dim);font-size:14px;line-height:1.6">No state-level data available for this territory.</p>`;
      return;
    }
    const count = states?.length || 0;
    body.innerHTML = `
      ${count ? `<div class="stat-grid">
        ${statCard("Divisions", count)}
        ${statCard("Type", states.find((s) => s.type)?.type?.split(" ")[0] || "State")}
      </div>` : ""}
      <button class="btn-3d" id="btn3dStates">🗺️ Show real state borders in 3D</button>
      <div id="stateDetail"></div>
      ${count ? `<div class="section-h">All divisions — click one</div>
      <div class="states-list">${states.map((s, i) => `<span class="state-chip" data-i="${i}">${s.name}</span>`).join("")}</div>` : ""}`;
    $("#btn3dStates").addEventListener("click", () => enterStateView(d));
    $$(".state-chip").forEach((chip) =>
      chip.addEventListener("click", () => {
        $$(".state-chip").forEach((x) => x.classList.remove("active"));
        chip.classList.add("active");
        showStateDetail(states[+chip.dataset.i], d, $("#stateDetail"));
      }));
  }
}

async function showStateDetail(st, countryD, mount) {
  mount.innerHTML = `<div class="wiki-block" style="margin:8px 0 16px"><div class="loading-dots">Loading ${st.name}</div></div>`;
  const country = nameOf(countryD);
  const wiki = await fetchWikiFirst([st.name, `${st.name}, ${country}`, `${st.name} (state)`]);
  mount.innerHTML = `<div class="wiki-block" style="margin:8px 0 16px">
      <b style="color:var(--gold)">${st.name}</b> ${st.type ? `<span class="pill" style="margin-left:6px">${st.type}</span>` : ""}<br/><br/>
      ${wiki ? wiki.extract : `<em style="color:var(--text-dim)">No summary available.</em>`}
      ${wiki?.url ? `<br/><a class="wiki-source" href="${wiki.url}" target="_blank" rel="noopener">Read more →</a>` : ""}
    </div>`;
  if (st.latitude && st.longitude) {
    S.globe.pointOfView({ lat: +st.latitude, lng: +st.longitude, altitude: 0.7 }, 1100);
    pauseRotate();
  }
}

/* ───────────────────── STATES: metadata list ───────────────────── */
function getStatesDataset() {
  if (!S.statesPromise) {
    const urls = [
      "https://cdn.jsdelivr.net/gh/dr5hn/countries-states-cities-database@master/json/states.json",
      "https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/states.json",
    ];
    S.statesPromise = (async () => {
      for (const u of urls) {
        try {
          const r = await fetch(u);
          if (r.ok) return await r.json();
        } catch (e) { /* try next */ }
      }
      return null;
    })();
  }
  return S.statesPromise;
}

async function getStates(cca2) {
  if (!cca2) return null;
  const all = await getStatesDataset();
  if (!all) return null;
  return all.filter((s) => s.country_code === cca2 && s.latitude && s.longitude);
}

/* ───────────────────── STATES: real 3D borders ───────────────────── */
async function loadAdm1(countryD) {
  const iso3raw = countryD.gv?.cca3;
  if (!iso3raw) return null;
  const iso3 = iso3raw === "UNK" ? "XKX" : iso3raw;
  if (S.adm1Cache.has(iso3)) return S.adm1Cache.get(iso3);

  let feats = null;
  if (iso3 === "IND") {
    // Official Survey of India state boundaries
    const j = await fetch("data/india-states-official.geojson").then((r) => r.json());
    feats = j.features;
  } else {
    const url = `https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/${iso3}/ADM1/geoBoundaries-${iso3}-ADM1_simplified.geojson`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("no adm1");
    feats = (await r.json()).features;
  }
  feats.forEach((f, i) => { f.__adm1 = true; f.__idx = i; });
  S.adm1Cache.set(iso3, feats);
  return feats;
}

async function enterStateView(countryD) {
  if (S.stateView) return;
  const btn = $("#btn3dStates");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Drawing state borders…"; }
  let adm1;
  try {
    adm1 = await loadAdm1(countryD);
    if (!adm1 || !adm1.length) throw new Error("empty");
  } catch (e) {
    toast(`⚠️ No state boundaries available for ${nameOf(countryD)}`);
    if (btn) { btn.disabled = false; btn.textContent = "🗺️ Show real state borders in 3D"; }
    return;
  }

  S.stateView = { country: countryD, adm1 };
  S.selected = null;
  $("#panel").classList.add("hidden");
  $("#stateBar").classList.remove("hidden");
  $("#stateBarTitle").textContent = `${flagEmoji(countryD.gv?.cca2)} ${nameOf(countryD)} — ${adm1.length} states & territories`;
  $("#hudHint").textContent = "Hover a state · Click for its story · Esc or click the ocean to leave";

  S.globe.polygonsData([...S.features, ...adm1]);
  refreshPolys();
  flyTo(countryD, 1400, 0.9);
  pauseRotate();
}

function exitStateView(refocusHint = true) {
  if (!S.stateView) return;
  S.stateView = null;
  heroLightOff();
  S.globe.polygonsData(S.features);
  $("#stateBar").classList.add("hidden");
  $("#panel").classList.add("hidden");
  $("#hudHint").textContent = "Drag to spin · Scroll to zoom · Click a country to dive in";
  refreshPolys();
  if (refocusHint) S.globe.pointOfView({ altitude: 2.2 }, 900);
}

function openStatePanel(stFeature) {
  if (!S.stateView) return;
  const countryD = S.stateView.country;
  const stName = stFeature.properties.shapeName || stFeature.properties.name || "State";
  flash(stFeature, "rgba(255,255,255,0.9)", 500);
  openInfoPanel({
    title: stName,
    subtitle: `${stFeature.properties.shapeType === "ADM1" || !stFeature.properties.shapeType ? "State / Province" : stFeature.properties.shapeType} · ${nameOf(countryD)}`,
    emoji: "📍",
    flagUrl: countryD.gv?.flags?.svg,
    wikiTitles: [stName, `${stName}, ${nameOf(countryD)}`, `${stName} (state)`],
  });
}

/* ───────────────────────── EARTH (NERD) MODE ───────────────────────── */
const WONDERS = [
  { name: "Mount Everest", lat: 27.988, lng: 86.925, kind: "peak", emoji: "⛰️" },
  { name: "K2", lat: 35.881, lng: 76.513, kind: "peak", emoji: "⛰️" },
  { name: "Kangchenjunga", lat: 27.703, lng: 88.147, kind: "peak", emoji: "⛰️" },
  { name: "Denali", lat: 63.069, lng: -151.007, kind: "peak", emoji: "⛰️" },
  { name: "Aconcagua", lat: -32.653, lng: -70.011, kind: "peak", emoji: "⛰️" },
  { name: "Mount Kilimanjaro", lat: -3.076, lng: 37.353, kind: "peak", emoji: "⛰️" },
  { name: "Mount Elbrus", lat: 43.355, lng: 42.439, kind: "peak", emoji: "⛰️" },
  { name: "Mont Blanc", lat: 45.833, lng: 6.865, kind: "peak", emoji: "⛰️" },
  { name: "Matterhorn", lat: 45.976, lng: 7.658, kind: "peak", emoji: "⛰️" },
  { name: "Mount Fuji", lat: 35.361, lng: 138.727, kind: "volcano", emoji: "🌋" },
  { name: "Vinson Massif", lat: -78.525, lng: -85.617, kind: "peak", emoji: "⛰️" },
  { name: "Table Mountain", lat: -33.957, lng: 18.403, kind: "peak", emoji: "⛰️" },
  { name: "Mount Vesuvius", lat: 40.821, lng: 14.426, kind: "volcano", emoji: "🌋" },
  { name: "Mount Etna", lat: 37.751, lng: 14.994, kind: "volcano", emoji: "🌋" },
  { name: "Krakatoa", lat: -6.102, lng: 105.423, kind: "volcano", emoji: "🌋" },
  { name: "Mauna Loa", lat: 19.479, lng: -155.602, kind: "volcano", emoji: "🌋" },
  { name: "Yellowstone Caldera", lat: 44.428, lng: -110.588, kind: "supervolcano", emoji: "🌋" },
  { name: "Cotopaxi", lat: -0.680, lng: -78.437, kind: "volcano", emoji: "🌋" },
  { name: "Eyjafjallajökull", lat: 63.633, lng: -19.633, kind: "volcano", emoji: "🌋" },
  { name: "Mount St. Helens", lat: 46.191, lng: -122.195, kind: "volcano", emoji: "🌋" },
  { name: "Angel Falls", lat: 5.970, lng: -62.535, kind: "waterfall", emoji: "💦" },
  { name: "Victoria Falls", lat: -17.924, lng: 25.856, kind: "waterfall", emoji: "💦" },
  { name: "Niagara Falls", lat: 43.079, lng: -79.075, kind: "waterfall", emoji: "💦" },
  { name: "Iguazu Falls", lat: -25.686, lng: -54.444, kind: "waterfall", emoji: "💦" },
  { name: "Grand Canyon", lat: 36.107, lng: -112.113, kind: "canyon", emoji: "🪨" },
  { name: "Fish River Canyon", lat: -27.583, lng: 17.583, kind: "canyon", emoji: "🪨" },
  { name: "Great Barrier Reef", lat: -18.286, lng: 147.700, kind: "reef", emoji: "🐠" },
  { name: "Mariana Trench", lat: 11.35, lng: 142.2, kind: "ocean trench", emoji: "🌀" },
  { name: "Galápagos Islands", lat: -0.777, lng: -91.142, kind: "islands", emoji: "🏝️" },
  { name: "Atacama Desert", lat: -24.5, lng: -69.25, kind: "desert", emoji: "🏜️" },
  { name: "Uluru", lat: -25.344, lng: 131.036, kind: "monolith", emoji: "🪨" },
  { name: "Perito Moreno Glacier", lat: -50.495, lng: -73.137, kind: "glacier", emoji: "🧊" },
  { name: "Vatnajökull", lat: 64.415, lng: -16.8, kind: "glacier", emoji: "🧊" },
  { name: "Greenland ice sheet", lat: 72.0, lng: -40.0, kind: "ice sheet", emoji: "🧊" },
  { name: "Lake Baikal", lat: 53.5, lng: 108.2, kind: "lake", emoji: "💧" },
  { name: "Dead Sea", lat: 31.5, lng: 35.5, kind: "salt lake", emoji: "💧" },
  { name: "Lake Titicaca", lat: -15.9, lng: -69.35, kind: "lake", emoji: "💧" },
  { name: "Caspian Sea", lat: 41.9, lng: 50.7, kind: "inland sea", emoji: "💧" },
  { name: "Lake Victoria", lat: -1.0, lng: 33.0, kind: "lake", emoji: "💧" },
  { name: "Amazon rainforest", lat: -3.4, lng: -62.2, kind: "rainforest", emoji: "🌳" },
  { name: "Salar de Uyuni", lat: -20.13, lng: -67.49, kind: "salt flat", emoji: "✨" },
  { name: "Ha Long Bay", lat: 20.910, lng: 107.184, kind: "bay", emoji: "🏝️" },
  { name: "Pamukkale", lat: 37.924, lng: 29.121, kind: "hot springs", emoji: "✨" },
  { name: "Cappadocia", lat: 38.643, lng: 34.827, kind: "landscape", emoji: "✨" },
  { name: "Great Blue Hole", lat: 17.316, lng: -87.535, kind: "sinkhole", emoji: "🌀" },
  { name: "Giant's Causeway", lat: 55.241, lng: -6.512, kind: "rock formation", emoji: "🪨" },
  { name: "Plitvice Lakes National Park", lat: 44.865, lng: 15.582, kind: "lakes", emoji: "💧" },
  { name: "Serengeti", lat: -2.333, lng: 34.833, kind: "savanna", emoji: "🌳" },
  { name: "Okavango Delta", lat: -19.28, lng: 22.9, kind: "delta", emoji: "💧" },
  { name: "Aurora", lat: 69.65, lng: 18.96, kind: "sky phenomenon", emoji: "🌌" },
  { name: "Sundarbans", lat: 21.95, lng: 89.18, kind: "mangrove forest", emoji: "🌳" },
  { name: "Zhangjiajie National Forest Park", lat: 29.315, lng: 110.434, kind: "landscape", emoji: "🏔️" },
];

const BIG_IDEAS = [
  ["🌞", "Season"], ["🌏", "Axial tilt"], ["🌧️", "Monsoon"], ["🌊", "El Niño"],
  ["💨", "Jet stream"], ["🌀", "Tropical cyclone"], ["🌊", "Gulf Stream"], ["🔄", "Thermohaline circulation"],
  ["🧩", "Plate tectonics"], ["🗺️", "Continental drift"], ["🔥", "Ring of Fire"], ["🌋", "Volcano"],
  ["📳", "Earthquake"], ["🌊", "Tsunami"], ["🌿", "Biome"], ["🌡️", "Köppen climate classification"],
  ["💧", "Water cycle"], ["🌙", "Tide"], ["🌌", "Aurora"], ["🏜️", "Desertification"],
  ["🧊", "Glacier"], ["🏞️", "Drainage basin"], ["🕐", "Time zone"], ["🌐", "Equator"],
];

function loadEarthData() {
  if (S.earth) return Promise.resolve(S.earth);
  return Promise.all([
    fetch(`${NE}/ne_110m_geography_marine_polys.geojson`).then((r) => r.json()),
    fetch(`${NE}/ne_110m_geography_regions_polys.geojson`).then((r) => r.json()),
    fetch(`${NE}/ne_110m_lakes.geojson`).then((r) => r.json()),
    fetch(`${NE}/ne_50m_rivers_lake_centerlines.geojson`).then((r) => r.json()),
  ]).then(([marine, regions, lakes, rivers]) => {
    const label = (f, kind, color, emoji, sizeBase) => {
      const [lng, lat] = d3.geoCentroid(f);
      const sr = f.properties.scalerank ?? 5;
      return { lat, lng, text: f.properties.name, kind, color, emoji, size: Math.max(0.55, sizeBase - sr * 0.13) };
    };
    const marineLabels = marine.features
      .filter((f) => f.properties.name)
      .map((f) => label(f, (f.properties.featurecla || "ocean").toLowerCase(), "#7fd4ff", "🌊", 1.9));
    const KINDMAP = { "Range/mtn": ["mountain range", "#ffcf8a", "🏔️"], "Desert": ["desert", "#ffd8a1", "🏜️"], "Plateau": ["plateau", "#e8c39a", "🗻"], "Peninsula": ["peninsula", "#b9e2a5", "🗺️"], "Basin": ["basin", "#c9d7a6", "🗺️"], "Island group": ["island group", "#a5e2c8", "🏝️"], "Delta": ["river delta", "#9fe8ff", "💧"], "Valley": ["valley", "#d0e3a1", "🏞️"], "Gorge": ["gorge", "#d8b26e", "🪨"], "Isthmus": ["isthmus", "#b9e2a5", "🗺️"] };
    const regionLabels = regions.features
      .filter((f) => f.properties.name && KINDMAP[f.properties.featurecla])
      .map((f) => {
        const [kind, color, emoji] = KINDMAP[f.properties.featurecla];
        return label(f, kind, color, emoji, 1.5);
      });
    const lakeLabels = lakes.features
      .filter((f) => f.properties.name)
      .map((f) => label(f, "lake", "#9fe8ff", "💧", 1.2));
    const riverPaths = [];
    for (const f of rivers.features) {
      if (!f.properties.name || (f.properties.scalerank ?? 9) > 8) continue;
      const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const line of lines) {
        if (line.length < 2) continue;
        riverPaths.push({ name: f.properties.name, pts: line.map(([lng, lat]) => [lat, lng]) });
      }
    }
    S.earth = { marineLabels, regionLabels, lakeLabels, riverPaths };
    return S.earth;
  });
}

async function enterEarthMode() {
  if (!S.earth) {
    toast("🌋 Loading Earth's physical features…");
    try { await loadEarthData(); }
    catch (e) { toast("⚠️ Couldn't load physical geography layers"); return; }
    if (S.mode !== "earth") return; // user switched away while loading
  }
  applyEarthLayers();
  S.globe.pointOfView({ altitude: 2.5 }, 1200);
}

function applyEarthLayers() {
  if (!S.earth || S.mode !== "earth") return;
  const L = S.earthLayers;
  const labels = [
    ...(L.oceans ? S.earth.marineLabels : []),
    ...(L.regions ? S.earth.regionLabels : []),
    ...(L.lakes ? S.earth.lakeLabels : []),
  ];
  S.globe
    .labelsData(labels)
    .pathsData(L.rivers ? S.earth.riverPaths : [])
    .htmlElementsData(L.wonders ? WONDERS : []);
}

function clearEarthLayers() {
  S.globe.labelsData([]).pathsData([]).htmlElementsData([]);
}

function openEarthFeature(l) {
  if (!l) return;
  const title = titleCase(l.text);
  if (l.lat != null) {
    S.globe.pointOfView({ lat: l.lat, lng: l.lng, altitude: 1.1 }, 1000);
    pauseRotate();
  }
  openInfoPanel({
    title,
    subtitle: l.kind,
    emoji: l.emoji || "🌍",
    wikiTitles: [l.wiki, title, `${title} (${l.kind})`, `${title} River`],
  });
}

function openBigIdeas() {
  ++S.panelToken;
  $("#panel").classList.remove("hidden");
  $("#panelTabs").style.display = "none";
  $("#panelHeader").style.setProperty("--flagbg", "none");
  $("#panelFlag").style.display = "none";
  $("#panelName").textContent = "📚 Big Ideas of Geography";
  $("#panelOfficial").textContent = "The forces that shape the planet";
  $("#panelBody").innerHTML = `
    <p style="font-size:13.5px;color:var(--text-dim);line-height:1.6;margin-bottom:12px">
      Why are there seasons? What drives the monsoon? Pick an idea:</p>
    <div class="states-list">${BIG_IDEAS.map(([e, t], i) => `<span class="state-chip" data-i="${i}">${e} ${t}</span>`).join("")}</div>
    <div id="ideaDetail" style="margin-top:14px"></div>`;
  $$("#panelBody .state-chip").forEach((chip) =>
    chip.addEventListener("click", async () => {
      $$("#panelBody .state-chip").forEach((x) => x.classList.remove("active"));
      chip.classList.add("active");
      const [emoji, topic] = BIG_IDEAS[+chip.dataset.i];
      const mount = $("#ideaDetail");
      mount.innerHTML = `<div class="wiki-block"><div class="loading-dots">Thinking about ${topic}</div></div>`;
      const wiki = await fetchWikiFirst([topic]);
      mount.innerHTML = `<div class="wiki-block"><b style="color:var(--gold)">${emoji} ${wiki?.title || topic}</b><br/><br/>${wikiBlockHtml(wiki)}</div>`;
    }));
}

/* ───────────────────────── SEARCH ───────────────────────── */
function initSearch() {
  const input = $("#searchInput");
  const box = $("#searchResults");

  function render(q) {
    if (!q) { box.classList.remove("open"); return; }
    const ql = q.toLowerCase();
    const hits = S.features
      .filter((f) => f.gv)
      .map((f) => {
        const name = nameOf(f).toLowerCase();
        const cap = (f.gv.capital?.[0] || "").toLowerCase();
        let score = -1;
        if (name.startsWith(ql)) score = 3;
        else if (name.includes(ql)) score = 2;
        else if (cap.startsWith(ql)) score = 1;
        return { f, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score || (b.f.gv.population || 0) - (a.f.gv.population || 0))
      .slice(0, 8);

    if (!hits.length) { box.classList.remove("open"); return; }
    box.innerHTML = hits.map(({ f }, i) =>
      `<div class="search-item${i === 0 ? " hl" : ""}" data-cca3="${f.gv.cca3}">
        <span class="si-flag">${flagEmoji(f.gv.cca2)}</span>
        <span>${nameOf(f)}</span>
        <span class="si-cap">${f.gv.capital?.[0] || ""}</span>
      </div>`).join("");
    box.classList.add("open");
    $$(".search-item").forEach((el) =>
      el.addEventListener("click", () => pick(el.dataset.cca3)));
  }

  function pick(cca3) {
    const f = S.byCca3.get(cca3);
    if (!f) return;
    input.value = "";
    box.classList.remove("open");
    input.blur();
    exitStateView(false);
    if (S.mode !== "explore") setMode("explore");
    selectCountry(f);
  }

  input.addEventListener("input", () => render(input.value.trim()));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = box.querySelector(".search-item");
      if (first) pick(first.dataset.cca3);
    }
    if (e.key === "Escape") { input.value = ""; box.classList.remove("open"); input.blur(); }
  });
  document.addEventListener("click", (e) => {
    if (!$("#searchWrap").contains(e.target)) box.classList.remove("open");
  });
}

/* ───────────────────────── QUIZ ───────────────────────── */
const ROUNDS = 10;

function quizPool() {
  return S.features.filter((f) =>
    f.gv && f.gv.population > 100000 &&
    (S.quizRegion === "World" || f.gv.region === S.quizRegion));
}

function startQuiz() {
  const pool = quizPool();
  if (pool.length < 8) { toast("Not enough countries in that arena!"); return; }
  S.quiz = {
    type: S.quizType, pool,
    used: new Set(), round: 0, score: 0, streak: 0, bestStreak: 0, correct: 0,
    target: null, attempts: 0, locked: false,
  };
  $("#quizSetup").classList.add("hidden");
  $("#quizResult").classList.add("hidden");
  $("#quizHud").classList.remove("hidden");
  $("#hudHint").textContent = S.quizType === "find" ? "Click the country on the globe!" : "Pick the right answer!";
  S.globe.pointOfView({ lat: 15, lng: 20, altitude: 2.6 }, 900);
  nextRound();
}

function nextRound() {
  const q = S.quiz;
  if (!q) return;
  q.round++;
  q.attempts = 0;
  q.locked = false;
  if (q.round > ROUNDS) return finishQuiz();

  let t;
  do { t = q.pool[Math.floor(Math.random() * q.pool.length)]; }
  while (q.used.has(t) && q.used.size < q.pool.length);
  q.used.add(t);
  q.target = t;

  $("#quizRound").textContent = `${q.round}/${ROUNDS}`;
  $("#quizScore").textContent = `${q.score} pts`;
  $("#quizStreak").textContent = `🔥 ${q.streak}`;
  $("#quizFeedback").textContent = "";
  $("#quizFeedback").className = "";

  const optBox = $("#quizOptions");
  if (q.type === "find") {
    optBox.classList.add("hidden");
    $("#quizPrompt").innerHTML = `<span class="qp-flag">${flagEmoji(t.gv.cca2)}</span> Find <b style="color:var(--gold)">${nameOf(t)}</b>`;
  } else if (q.type === "capital") {
    $("#quizPrompt").innerHTML = `<span class="qp-flag">${flagEmoji(t.gv.cca2)}</span> Capital of <b style="color:var(--gold)">${nameOf(t)}</b>?`;
    const correct = t.gv.capital?.[0];
    const distractors = d3.shuffle(q.pool.filter((f) => f !== t && f.gv.capital?.[0] && f.gv.capital[0] !== correct).slice())
      .slice(0, 3).map((f) => f.gv.capital[0]);
    buildOptions(d3.shuffle([correct, ...distractors]), (o) => o === correct);
    flyTo(t, 1200);
  } else { // flag
    $("#quizPrompt").innerHTML = `<img src="${t.gv.flags.png}" alt="?" style="height:64px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.5)" /><br/>Whose flag is this?`;
    const distractors = d3.shuffle(q.pool.filter((f) => f !== t).slice()).slice(0, 3).map((f) => nameOf(f));
    buildOptions(d3.shuffle([nameOf(t), ...distractors]), (o) => o === nameOf(t));
  }
  refreshPolys();
}

function buildOptions(options, isCorrect) {
  const box = $("#quizOptions");
  box.classList.remove("hidden");
  box.innerHTML = options.map((o) => `<button class="q-opt" data-c="${isCorrect(o) ? 1 : 0}">${o}</button>`).join("");
  $$(".q-opt").forEach((b) => b.addEventListener("click", () => choiceAnswer(b)));
}

function award(base) {
  const q = S.quiz;
  const pts = Math.max(20, base + q.streak * 15 - q.attempts * 30);
  q.score += pts;
  q.streak++;
  q.correct++;
  q.bestStreak = Math.max(q.bestStreak, q.streak);
  return pts;
}

function quizMapClick(d, ev) {
  const q = S.quiz;
  if (q.type !== "find" || q.locked || !d) return;
  const fb = $("#quizFeedback");

  if (d === q.target) {
    q.locked = true;
    const pts = award(100);
    fb.textContent = `✅ +${pts} pts — that's ${nameOf(d)}!`;
    fb.className = "good";
    flash(d, "rgba(61,220,132,0.85)", 1100);
    confetti({
      particleCount: 90, spread: 75, startVelocity: 38,
      origin: { x: (ev?.clientX ?? innerWidth / 2) / innerWidth, y: (ev?.clientY ?? innerHeight / 2) / innerHeight },
      colors: ["#3ddc84", "#ffd166", "#4db8ff", "#ffffff"],
    });
    setTimeout(nextRound, 1300);
  } else {
    q.attempts++;
    flash(d, "rgba(255,93,115,0.75)", 700);
    if (q.attempts >= 3) {
      q.locked = true;
      q.streak = 0;
      fb.innerHTML = `❌ It was here — <b>${nameOf(q.target)}</b>`;
      fb.className = "bad";
      flash(q.target, "rgba(255,209,102,0.9)", 2100);
      flyTo(q.target, 1000);
      setTimeout(nextRound, 2400);
    } else {
      const dist = haversine(centroidOf(d), centroidOf(q.target));
      const hint = q.attempts === 2 ? ` · hint: it's in ${q.target.gv.subregion || q.target.gv.region}` : "";
      fb.innerHTML = `That's ${nameOf(d)}. Head ${bearingArrow(centroidOf(d), centroidOf(q.target))} ≈ ${fmtFull.format(Math.round(dist / 100) * 100)} km${hint}`;
      fb.className = "bad";
    }
    $("#quizStreak").textContent = `🔥 ${q.streak}`;
  }
  $("#quizScore").textContent = `${q.score} pts`;
}

function choiceAnswer(btn) {
  const q = S.quiz;
  if (!q || q.locked) return;
  q.locked = true;
  const good = btn.dataset.c === "1";
  const fb = $("#quizFeedback");
  $$(".q-opt").forEach((b) => { if (b.dataset.c === "1") b.classList.add("correct"); });

  if (good) {
    const pts = award(100);
    fb.textContent = `✅ +${pts} pts!`;
    fb.className = "good";
    flash(q.target, "rgba(61,220,132,0.85)", 1100);
    confetti({ particleCount: 80, spread: 70, origin: { x: 0.5, y: 0.35 }, colors: ["#3ddc84", "#ffd166", "#4db8ff"] });
  } else {
    btn.classList.add("wrong");
    q.streak = 0;
    fb.textContent = q.type === "capital" ? `❌ It's ${q.target.gv.capital[0]}.` : `❌ That's the flag of ${nameOf(q.target)}.`;
    fb.className = "bad";
  }
  if (q.type === "flag") flyTo(q.target, 1100);
  $("#quizScore").textContent = `${q.score} pts`;
  $("#quizStreak").textContent = `🔥 ${q.streak}`;
  setTimeout(nextRound, 1600);
}

function skipRound() {
  const q = S.quiz;
  if (!q || q.locked) return;
  q.streak = 0;
  if (q.type === "find") {
    q.locked = true;
    flash(q.target, "rgba(255,209,102,0.9)", 1800);
    flyTo(q.target, 900);
    $("#quizFeedback").innerHTML = `It was <b>${nameOf(q.target)}</b>`;
    $("#quizFeedback").className = "bad";
    setTimeout(nextRound, 2000);
  } else nextRound();
}

function finishQuiz() {
  const q = S.quiz;
  $("#quizHud").classList.add("hidden");
  const best = +(localStorage.getItem("gv-best") || 0);
  const newBest = q.score > best;
  if (newBest) localStorage.setItem("gv-best", q.score);

  const pct = q.correct / ROUNDS;
  const [emoji, title] =
    pct === 1 ? ["👑", "Flawless. Atlas himself would be proud."] :
    pct >= 0.8 ? ["🏆", "Outstanding geographer!"] :
    pct >= 0.5 ? ["🌍", "Solid explorer — keep charting!"] :
    ["🧭", "The world is big. Keep exploring!"];

  $("#resultEmoji").textContent = emoji;
  $("#resultTitle").textContent = title;
  $("#resultStats").innerHTML =
    `<b>${q.score} pts</b> · ${q.correct}/${ROUNDS} correct · best streak 🔥 ${q.bestStreak}` +
    (newBest ? `<br/><span style="color:var(--gold)">✨ New personal best!</span>` : ``);
  $("#quizResult").classList.remove("hidden");
  if (newBest) confetti({ particleCount: 160, spread: 100, origin: { y: 0.4 } });
  S.quiz = null;
}

function endQuiz(silent = false) {
  S.quiz = null;
  $("#quizHud").classList.add("hidden");
  $("#quizSetup").classList.add("hidden");
  $("#quizResult").classList.add("hidden");
  if (!silent) setMode("explore");
}

/* ───────────────────────── WIRE UP ───────────────────────── */
function initUI() {
  $$(".mode-tab").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $$(".tex-btn").forEach((b) => b.addEventListener("click", () => setTexture(b.dataset.tex)));

  $$("#quizTypeSeg .seg-btn").forEach((b) => b.addEventListener("click", () => {
    S.quizType = b.dataset.qtype;
    $$("#quizTypeSeg .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
  }));
  $$("#quizRegionSeg .seg-btn").forEach((b) => b.addEventListener("click", () => {
    S.quizRegion = b.dataset.region;
    $$("#quizRegionSeg .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
  }));
  $("#quizStart").addEventListener("click", startQuiz);
  $("#quizSkip").addEventListener("click", skipRound);
  $("#quizQuit").addEventListener("click", () => endQuiz());
  $("#quizSetupClose").addEventListener("click", () => setMode("explore"));
  $("#quizResultClose").addEventListener("click", () => setMode("explore"));
  // clicking the dark backdrop (outside the card) also leaves
  $("#quizSetup").addEventListener("click", (e) => { if (e.target.id === "quizSetup") setMode("explore"); });
  $("#quizResult").addEventListener("click", (e) => { if (e.target.id === "quizResult") setMode("explore"); });
  $("#resultAgain").addEventListener("click", () => { $("#quizResult").classList.add("hidden"); $("#quizSetup").classList.remove("hidden"); });
  $("#resultExplore").addEventListener("click", () => setMode("explore"));

  $$(".metric-btn[data-metric]").forEach((b) => b.addEventListener("click", () => setAtlasMetric(b.dataset.metric)));
  $("#atlas3d").addEventListener("change", (e) => { S.atlas3d = e.target.checked; refreshPolys(); });

  $$(".layer-btn").forEach((b) => b.addEventListener("click", () => {
    const key = b.dataset.layer;
    S.earthLayers[key] = !S.earthLayers[key];
    b.classList.toggle("on", S.earthLayers[key]);
    applyEarthLayers();
  }));
  $("#bigIdeasBtn").addEventListener("click", openBigIdeas);

  $("#panelClose").addEventListener("click", () => {
    $("#panel").classList.add("hidden");
    if (!S.stateView) closePanel();
  });
  $$(".ptab").forEach((b) => b.addEventListener("click", () => {
    if (!S.selected) return;
    S.panelTab = b.dataset.tab;
    $$(".ptab").forEach((x) => x.classList.toggle("active", x === b));
    renderPanelTab(S.selected);
  }));

  $("#stateBack").addEventListener("click", () => exitStateView());

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== $("#searchInput")) {
      e.preventDefault();
      $("#searchInput").focus();
    }
    if (e.key === "Escape") {
      if (!$("#quizSetup").classList.contains("hidden") || !$("#quizResult").classList.contains("hidden")) setMode("explore");
      else if (S.quiz) endQuiz();
      else if (S.stateView) exitStateView();
      else if (!$("#panel").classList.contains("hidden")) closePanel();
    }
  });

  initSearch();
}

/* ───────────────────────── BOOT ───────────────────────── */
(async function boot() {
  try {
    await loadData();
    initGlobe();
    initFx();
    initUI();
    updateProgress();
    loaderStep(100, "Ready for lift-off 🚀");

    setTimeout(() => getStatesDataset(), 4000); // pre-warm states metadata

    setTimeout(() => {
      $("#loader").classList.add("done");
      S.globe.pointOfView({ lat: 18, lng: 30, altitude: 2.4 }, 2400);
    }, 500);
  } catch (err) {
    console.error(err);
    loaderStep(100, "⚠️ Couldn't reach map data — check your internet connection and refresh.");
  }
})();
