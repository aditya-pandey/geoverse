/* ═══════════════════════════════════════════════════════════
   GEOVERSE — The Living Atlas
   A cinematic 3D geography experience.
   Data: Natural Earth · world-countries · World Bank · Wikipedia
         geoBoundaries (states) · Survey of India (official Indian map)
   ═══════════════════════════════════════════════════════════ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

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

// Layout / input environment. Mobile = bottom sheets + bottom nav; desktop = side drawer.
const MOBILE_MQ = matchMedia("(max-width: 768px)");
const isMobile = () => MOBILE_MQ.matches;
const isCoarse = () => matchMedia("(pointer: coarse)").matches;

// localStorage that never throws (private mode, quota, disabled storage)
const store = {
  get(k, fallback) {
    try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

/* ───────────────────────── STATE ───────────────────────── */
const S = {
  globe: null,
  features: [],
  byCca3: new Map(),
  mode: "explore",
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
  visited: new Set(store.get("gv-visited", [])),
  wondersSeen: new Set(store.get("gv-wonders", [])),
  bests: store.get("gv-bests", {}), // "type|region|difficulty" → best score
  arcadeBests: store.get("gv-arcade-bests", {}),
  arcadeMode: "mystery",   // "mystery" | "chain" | "pinpoint" | "blitz"
  activeTour: null,        // { tour, stopIndex }
  toursCompleted: new Set(store.get("gv-tours", [])),
  idleTimer: null,
  dwellTimer: null,
  quiz: null,
  quizType: "find",
  quizRegion: "World",
  quizDiff: "N",
  pendingChallenge: null,  // { seed, type, region, diff, code } from a ?challenge= link
  statesPromise: null,
  earth: null,             // { marine, regions, lakes, rivers } once loaded
  earthPromise: null,
  earthNoZoom: false,
  earthLayers: { oceans: true, regions: true, rivers: true, lakes: false, wonders: true },
  wikiCache: new Map(),
  lifePin: null,           // { __kind: "life", lat, lng, sp, uid } — 3D wildlife card on the globe
  atlasPick: null,         // country inspected in Atlas mode (tap-to-inspect / rank badge)
  info: null,              // what a non-country panel shows: { type: "feature" | "ideas" | "state", … }
  compare: null,           // { a, b } countries in head-to-head mode
  comparePick: false,      // waiting for the user to choose country B
  micro: [],               // pins for micro-states & small islands
  pins: store.get("gv-pins-v2", false),
  names: store.get("gv-names", true), // country names on the globe
  mapStyle: store.get("gv-map", "political"), // "political" | "terrain"
  sound: store.get("gv-sound", false),
  paused: false,           // render loop paused (tab hidden / full-screen modal)
  searchIndex: null,
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

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Every country exactly once (a few map units share a dataset entry)
function uniqueCountries() {
  if (!uniqueCountries._list) {
    const seen = new Set();
    uniqueCountries._list = S.features.filter((f) => f.gv && !seen.has(f.gv.cca3) && seen.add(f.gv.cca3));
  }
  return uniqueCountries._list;
}

const panelVisible = () => !$("#panel").classList.contains("hidden");
const isTyping = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // insecure context / denied permission → legacy fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e2) { /* ignore */ }
    ta.remove();
    return ok;
  }
}

async function fetchWiki(title) {
  if (S.wikiCache.has(title)) return S.wikiCache.get(title);
  try {
    const raw = sessionStorage.getItem("gv-wiki-" + title);
    if (raw) {
      const parsed = JSON.parse(raw);
      S.wikiCache.set(title, parsed);
      return parsed;
    }
  } catch (e) { /* storage unavailable/quota */ }

  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`);
  if (!r.ok) throw new Error("wiki 404");
  const j = await r.json();
  if (j.type === "disambiguation") throw new Error("ambiguous");
  const out = {
    extract: j.extract,
    thumb: j.thumbnail?.source || j.originalimage?.source || null,
    url: j.content_urls?.desktop?.page,
    title: j.title,
    description: j.description || "",
  };
  S.wikiCache.set(title, out);
  try {
    sessionStorage.setItem("gv-wiki-" + title, JSON.stringify(out));
  } catch (e) { /* quota exceeded, safe to ignore */ }
  return out;
}

async function fetchWikiFirst(titles) {
  for (const t of titles.filter(Boolean)) {
    try { return await fetchWiki(t); } catch (e) { /* try next */ }
  }
  return null;
}

const wikiTitle = (d) => WIKI_OVERRIDES[nameOf(d)] || nameOf(d);

function wikiPhotoHeroHtml(wiki, title) {
  const thumbUrl = wiki?.thumb;
  if (thumbUrl) {
    return `<div class="story-photo-banner">
      <img src="${thumbUrl}" alt="${esc(title)}" loading="lazy" />
      <span class="story-photo-credit">Wikipedia · ${esc(title)}</span>
    </div>`;
  }
  return "";
}

const wikiBlockHtml = (wiki, fallbackMsg = "No encyclopedia entry available.") => wiki
  ? `${wiki.extract}
     <br/><a class="wiki-source" href="${wiki.url}" target="_blank" rel="noopener">Full article: ${wiki.title} →</a>`
  : `<em style="color:var(--text-dim)">${fallbackMsg}</em>`;

/* ───────────────────── 3-BEAT MICRO-STORY ENGINE ───────────────────── */
function generateCountryStory(d) {
  const c = d.gv;
  const name = nameOf(d);
  const pop = c?.population || 0;
  const area = c?.area || 0;
  const region = c?.region || "";
  const subregion = c?.subregion || "";
  const capital = c?.capital?.[0] || "";
  const isIsland = c?.borders ? c.borders.length === 0 : false;
  const isLandlocked = !!c?.landlocked;

  const CURATED = {
    "United States": {
      spark: "Stretches across six climate zones from Alaskan glaciers to Hawaiian tropical volcanoes, harboring the third-largest population on Earth.",
      howItWorks: "Flanked by two massive oceans, its central Great Plains act as a giant weather funnel between freezing Arctic air and warm Caribbean moisture, creating dramatic continental seasons.",
      flightHours: "6 hours flight coast-to-coast non-stop",
      analog: "Roughly the same physical land area as the entire European continent",
    },
    "China": {
      spark: "Cradles one of humanity's oldest continuous civilizations, with ecosystems spanning the highest mountains on Earth to subtropical jade river gorges.",
      howItWorks: "Cascades downward in three colossal geographic steps: from the sky-high Tibetan Plateau, down through fertile terraced basins, to the densely populated coastal delta lowlands.",
      flightHours: "5.5 hours flight from western desert to eastern coast",
      analog: "Home to nearly 1 in every 6 humans alive today",
    },
    "India": {
      spark: "A vibrant subcontinent where the world's tallest mountain wall feeds sacred river plains that sustain over 1.4 billion people.",
      howItWorks: "Driven by the annual South Asian Monsoon—when the heated continental landmass draws moisture-rich Indian Ocean winds over the Western Ghats, watering the fertile plains.",
      flightHours: "4 hours flight from Kashmir in the north to Kanyakumari in the south",
      analog: "Sustains nearly 18% of global humanity on just 2.4% of Earth's land area",
    },
    "Brazil": {
      spark: "Anchors South America with the Amazon basin—the world's greatest freshwater system and planetary oxygen & weather pump.",
      howItWorks: "The Amazon rainforest generates its own 'flying rivers'—evapotranspiration from billions of trees pumps vapor clouds southward, watering the breadbaskets of the continent.",
      flightHours: "5.5 hours flight from northern rainforest to southern pampas",
      analog: "Holds 20% of Earth's unfrozen liquid freshwater",
    },
    "Japan": {
      spark: "An archipelago of 6,800+ mountainous islands where ancient sacred cedar forests meet bullet-train megalopolises along the volcanic Ring of Fire.",
      howItWorks: "Positioned directly at the violent collision point of four major tectonic plates, producing regular earth tremors, natural hot springs (onsen), and over 100 active volcanoes.",
      flightHours: "3.5 hours flight from subarctic Hokkaido to subtropical Okinawa",
      analog: "73% of its terrain is rugged mountains and lush temperate forest",
    },
    "Egypt": {
      spark: "Home to the world's longest river oasis, where 95% of the entire population lives on just 4% of the land surrounded by glowing desert sands.",
      howItWorks: "The Nile River cuts through the hyper-arid Sahara, depositing nutrient-rich silt that enabled thousands of years of uninterrupted human agriculture and pyramid-building.",
      flightHours: "2 hours flight across the delta and desert",
      analog: "96% of its territory is hyper-arid Sahara desert",
    },
    "Australia": {
      spark: "An island continent that drifted in deep ocean isolation for 50 million years, evolving marsupials and monotremes found nowhere else on planet Earth.",
      howItWorks: "The flattest and driest inhabited continent; ancient weathered soils and low tectonic activity produced vast red deserts ('the Outback') bordered by tropical coral reefs.",
      flightHours: "5 hours flight non-stop from Sydney to Perth",
      analog: "Roughly the same physical land area as the 48 contiguous United States",
    },
    "United Kingdom": {
      spark: "A wind-swept maritime archipelago whose Gulf Stream waters keep it temperate and lush despite sitting as far north as icy Canadian wilderness.",
      howItWorks: "The ocean-spanning North Atlantic Drift pumps warm equatorial currents past its coasts, giving it mild winters, rolling green pastures, and famous ocean rainfall.",
      flightHours: "1.5 hours flight from London to Edinburgh",
      analog: "Has over 12,400 km of island coastline",
    },
    "France": {
      spark: "The geographic crossroads of Western Europe, connecting the sun-drenched Mediterranean, rugged snow-capped Alps, and fertile Atlantic plains.",
      howItWorks: "Benefiting from three distinct climate zones and rich alluvial river valleys (Seine, Loire, Rhône), making it Europe's historical agricultural powerhouse.",
      flightHours: "1.5 hours flight from Paris to Nice",
      analog: "Most visited country on Earth, welcoming over 100M travelers yearly",
    },
    "Germany": {
      spark: "The industrial and cultural engine at Europe's heart, threaded by the storied Rhine and Danube rivers connecting alpine heights to the North Sea.",
      howItWorks: "Glacial meltwater and ancient river valleys carved natural trade corridors through forested uplands, establishing trade routes since Roman times.",
      flightHours: "1.2 hours flight from Hamburg to Munich",
      analog: "Borders 9 different European nations",
    },
    "Canada": {
      spark: "The second-largest country on Earth, sheltering more freshwater lakes than all other nations combined beneath vibrant dancing Northern Lights.",
      howItWorks: "Carved by massive ice sheets during the last Ice Age, leaving behind millions of pristine glacial lakes, boreal evergreen taiga, and the ancient Canadian Shield.",
      flightHours: "7 hours flight from St. John's to Vancouver",
      analog: "Spans 6 time zones and touches 3 different oceans",
    },
    "Russia": {
      spark: "Spans 11 time zones and two continents, stretching from European palaces across Siberian wilderness to Pacific volcano ridges.",
      howItWorks: "The Ural Mountains create the boundary between Europe and Asia, while the endless Siberian taiga acts as one of Earth's biggest terrestrial carbon sinks.",
      flightHours: "9 hours flight non-stop from Moscow to Vladivostok",
      analog: "Covers over one-eighth of Earth's total inhabited land area",
    },
    "South Africa": {
      spark: "The 'Rainbow Nation' anchored by Table Mountain, where the cold Atlantic and warm Indian oceans meet in a wonderland of megafauna and floral kingdoms.",
      howItWorks: "Its elevated interior plateau (Highveld) drops off in dramatic coastal escarpments, generating unique microclimates that nurture the Cape Floral Kingdom.",
      flightHours: "2 hours flight from Johannesburg to Cape Town",
      analog: "One of only 17 mega-diverse biodiversity hotspots on Earth",
    },
    "Kenya": {
      spark: "The cradle of early hominids, where the Great Rift Valley tears across golden savannas filled with the greatest animal migrations on Earth.",
      howItWorks: "Tectonic forces slowly pulling East Africa apart created the deep Rift Valley, volcanic peaks, and soda lakes that host millions of pink flamingos and migrating wildebeest.",
      flightHours: "1 hour flight across the Rift Valley",
      analog: "Over 1.5 million animals make the annual Great Migration across its plains",
    },
    "Norway": {
      spark: "A land of midnight sun and dramatic sea-drowned canyons, where emerald ocean waters flow deep inside vertical mountain walls.",
      howItWorks: "Massive glaciers during successive ice ages gouged steep U-shaped valleys far below sea level; when the ice melted, the Atlantic flooded in to create the world-famous fjords.",
      flightHours: "2.5 hours flight from Oslo to Tromsø",
      analog: "Coastline includes over 50,000 islands and skerries",
    },
    "Iceland": {
      spark: "The legendary land of fire and ice, where glowing molten lava erupts right alongside blue-glowing glacial ice caps on the Mid-Atlantic Ridge.",
      howItWorks: "Sits squarely atop both a volcanic hotspot and the spreading seam between the North American and Eurasian tectonic plates, continuously creating new crust.",
      flightHours: "1 hour flight across the island",
      analog: "Generates 100% of its electricity and heating from green geothermal & hydro power",
    },
    "Indonesia": {
      spark: "The world's largest island nation, spanning over 17,000 islands across three time zones along the tropical equatorial belt.",
      howItWorks: "Volcanic ash from hundreds of active volcanoes continuously replenishes mineral-rich soils, enabling dense rainforests and ancient terraced rice farming.",
      flightHours: "5.5 hours flight from Banda Aceh in the west to Jayapura in the east",
      analog: "Home to over 300 distinct ethnic groups and 700+ spoken languages",
    },
    "Argentina": {
      spark: "Stretches from subtropical jungle waterfalls to the icy subantarctic glaciers and towering windswept granite peaks of Patagonia.",
      howItWorks: "The rain shadow of the Andes Mountains creates the vast, semi-arid Patagonian steppe to the south, while fertile eastern pampas support legendary livestock pastures.",
      flightHours: "4.5 hours flight from Iguazu Falls to Ushuaia",
      analog: "Home to both the highest peak (Aconcagua) and lowest point in South America",
    },
    "Saudi Arabia": {
      spark: "The heart of the Arabian Peninsula, where golden dunes meet turquoise Red Sea reefs and ancient frankincense caravan crossroads.",
      howItWorks: "Persistent high atmospheric pressure over the subtropical belt creates hyper-arid deserts, but subterranean aquifers and coastal coral reefs support surprising life.",
      flightHours: "2.5 hours flight across the desert peninsula",
      analog: "Contains Rub' al Khali, the largest continuous sand desert on Earth",
    },
    "New Zealand": {
      spark: "Two remote islands of alpine fjords, geothermal wonders, and flightless birds that evolved in complete absence of mammalian predators.",
      howItWorks: "Active subduction of tectonic plates pushes the Southern Alps upward while fueling bubbling mud pools, geysers, and steaming volcanoes on the North Island.",
      flightHours: "2 hours flight between Auckland and Queenstown",
      analog: "Humans first settled here only ~750 years ago, making it the last major landmass reached by humanity",
    },
  };

  const curated = CURATED[name];
  let spark = "";
  let howItWorks = "";

  if (curated) {
    spark = curated.spark;
    howItWorks = curated.howItWorks;
  } else {
    if (isIsland) {
      spark = `An ocean-embraced island territory in ${subregion || region}, shaped by sea currents and marine biodiversity.`;
      howItWorks = `Isolated from continental landmasses, its local microclimates and ecosystems are directly moderated by the surrounding ocean waters.`;
    } else if (isLandlocked) {
      spark = `A continental landlocked nation in ${subregion || region}, bordered entirely by neighboring countries with no direct coastline.`;
      howItWorks = `Surrounded by land, its seasonal temperatures swing dramatically between summer and winter without maritime buffering.`;
    } else {
      spark = `A vibrant country in ${subregion || region}, bridging historic trade corridors with distinct regional geography.`;
      howItWorks = `Its climate and ecosystems are shaped by the interaction of ${region} air masses with its terrain and waterways.`;
    }
  }

  const humanScales = [];
  const globalPop = 8.1e9;
  if (pop > 0) {
    const share = ((pop / globalPop) * 100).toFixed(1);
    const oneIn = Math.round(globalPop / pop);
    const shareText = pop > 50e6 ? `~${share}% of all humans` : (oneIn > 1 ? `1 in every ${fmtFull.format(oneIn)} people` : `${fmt.format(pop)} citizens`);
    humanScales.push({ label: "World Share", val: shareText });
  }

  if (area > 0) {
    const flightHours = curated?.flightHours || (
      area > 5e6 ? "~6+ hours flight non-stop" :
      area > 1e6 ? "~3-4 hours flight across" :
      area > 2e5 ? "~1-2 hours flight across" :
      "< 1 hour flight across"
    );
    humanScales.push({ label: "Flight Scale", val: flightHours });
  }

  const density = (area > 0 && pop > 0) ? Math.round(pop / area) : null;
  if (density != null) {
    const soccerPitchM2 = 7140;
    const soccerShare = (density * (soccerPitchM2 / 1e6)).toFixed(1);
    const pitchText = density > 500 ? `~${Math.round(soccerShare)} people / soccer field` : (density < 10 ? "Vast open wilderness" : `Balanced living space`);
    humanScales.push({ label: "Living Room", val: pitchText });
  }

  if (curated?.analog) {
    humanScales.push({ label: "Perspective", val: curated.analog });
  }

  return { spark, howItWorks, humanScales };
}

function generateWonderStory(w) {
  const STORIES = {
    "Mount Everest": {
      spark: "The rooftop of the world at 8,848 meters, where sea lily fossils near the summit prove it was once the floor of an ancient ocean.",
      howItWorks: "The Indian tectonic plate is continuously colliding with the Eurasian plate at ~5 cm per year, crumpling the Earth's crust and pushing the Himalayas higher.",
      scale: "Stacking 20 Empire State Buildings on top of each other would barely reach its summit.",
    },
    "Grand Canyon": {
      spark: "A mile-deep gorge carved across six million years of rushing Colorado River water, exposing two billion years of Earth's rock layers.",
      howItWorks: "As tectonic forces slowly hoisted the entire Colorado Plateau skyward, the river held its course, slicing downward through rock like a circular saw.",
      scale: "Could fit the entire 8 billion population of planet Earth inside with plenty of room to spare.",
    },
    "Great Barrier Reef": {
      spark: "The largest living structure on Earth, so colossal it is clearly visible to astronauts in low Earth orbit.",
      howItWorks: "Billions of microscopic coral polyps secrete calcium carbonate skeletons, creating an underwater mega-city that shelters 25% of all marine life.",
      scale: "Stretches 2,300 km along the Australian coast—roughly the distance from London to Athens.",
    },
    "Victoria Falls": {
      spark: "The world's largest curtain of falling water, producing thunderous spray clouds visible from 50 kilometers away.",
      howItWorks: "The wide Zambezi River abruptly drops 108 meters into a narrow, zigzagging transverse fracture carved into a volcanic basalt plateau.",
      scale: "Twice the height and twice the width of Niagara Falls, pouring over 500 million liters every minute at peak flood.",
    },
    "Mariana Trench": {
      spark: "The deepest abyss on the surface of our planet, plunging 11 kilometers down into pitch-black freezing ocean trenches.",
      howItWorks: "The heavy, dense Pacific plate is driven down into the Earth's mantle beneath the smaller Mariana plate at a deep subduction trench.",
      scale: "If Mount Everest were placed at the bottom, its peak would still be submerged under 2,000 meters of water.",
    },
  };

  const s = STORIES[w.name];
  if (s) return s;

  return {
    spark: `A spectacular natural wonder of our planet, celebrated for its extraordinary ${w.kind} geography.`,
    howItWorks: `Formed over millions of years through geological forces like tectonic uplift, volcanic activity, and relentless hydrological erosion.`,
    scale: `One of the planet's premier geographic reference landmarks for understanding Earth's history.`,
  };
}

/* ───────────────────── GUIDED 5-MINUTE STORY EXPEDITIONS ───────────────────── */
const STORY_TOURS = [
  {
    id: "ring-of-fire",
    title: "The Ring of Fire",
    subtitle: "Tectonic fury, deep trenches, and volcanic islands",
    icon: "🌋",
    duration: "5 MINS",
    description: "Follow colliding tectonic plates releasing trapped ocean water into molten magma across 450+ roaring volcanoes.",
    stops: [
      {
        name: "Mount Fuji",
        country: "Japan",
        type: "Active Stratovolcano",
        lat: 35.3606, lng: 138.7274, alt: 1.15,
        spark: "Japan's sacred mountain is actually three stacked volcanoes built over hundreds of thousands of years.",
        explain: "The Pacific plate dives under the Eurasian plate, dragging ocean water into the mantle. Water lowers the melting point of rock, creating magma that rises straight up.",
        scale: "At 3,776 m, it is visible from Tokyo 100 km away on crisp winter mornings.",
        wiki: "Mount Fuji",
      },
      {
        name: "Mariana Trench",
        country: "Pacific Ocean",
        type: "Deepest Subduction Trench",
        lat: 11.349, lng: 142.199, alt: 1.25,
        spark: "The deepest abyss on the planet, plunging 11 kilometers down into pitch-black freezing trenches.",
        explain: "The ancient, dense Pacific plate is driven down into the Earth's mantle beneath the Mariana plate at a deep subduction zone.",
        scale: "If Mount Everest were placed at the bottom, its peak would still be submerged under 2,000 meters of water.",
        wiki: "Mariana Trench",
      },
      {
        name: "Krakatoa",
        country: "Indonesia",
        type: "Volcanic Caldera Island",
        lat: -6.102, lng: 105.423, alt: 1.15,
        spark: "In 1883, Krakatoa exploded with the loudest sound ever recorded by humanity—heard 4,800 km away.",
        explain: "Cold seawater poured into the subterranean magma chamber, triggering a colossal steam explosion that blew two-thirds of the island off the map.",
        scale: "The atmospheric sound wave circled the entire globe four times before dying out.",
        wiki: "Krakatoa",
      },
      {
        name: "Cotopaxi",
        country: "Ecuador",
        type: "Equatorial Snow Peak Volcano",
        lat: -0.680, lng: -78.437, alt: 1.15,
        spark: "One of the highest active volcanoes in the world, sitting right on the Equator yet covered in permanent glaciers.",
        explain: "The Nazca plate subducts eastward beneath the South American continent, pushing up the entire Andes mountain chain and feeding explosive volcanoes.",
        scale: "Rises to 5,897 m—higher than any mountain in Europe or the contiguous United States.",
        wiki: "Cotopaxi",
      },
      {
        name: "Mauna Loa",
        country: "United States",
        type: "Colossal Shield Volcano",
        lat: 19.479, lng: -155.602, alt: 1.25,
        spark: "From its underwater base on the sea floor, Mauna Loa is taller than Mount Everest.",
        explain: "Unlike Ring of Fire subduction volcanoes, Hawaii sits over a stationary mantle hotspot in the Pacific plate that oozes fluid basaltic lava.",
        scale: "Measured from its sea-floor base to summit, it stands over 9,170 meters tall.",
        wiki: "Mauna Loa",
      },
    ]
  },
  {
    id: "life-extremes",
    title: "Life at the Extremes",
    subtitle: "The hottest, coldest, highest, and driest inhabited places on Earth",
    icon: "❄️",
    duration: "5 MINS",
    description: "From sub-zero Siberian permafrost to boiling Ethiopian acid cauldrons, discover evolutionary marvels of extreme adaptation.",
    stops: [
      {
        name: "Atacama Desert",
        country: "Chile",
        type: "Hyper-Arid Red Plateau",
        lat: -24.5, lng: -69.25, alt: 1.2,
        spark: "Some weather stations here have never recorded a single drop of rain in human history.",
        explain: "Trapped between the high Andes and the Chilean Coast Range in a double rain shadow, cooled by ocean currents that prevent storm formation.",
        scale: "So dry and barren that NASA uses it to test Mars exploration rovers.",
        wiki: "Atacama Desert",
      },
      {
        name: "Mount Everest & Himalayas",
        country: "Nepal",
        type: "High-Altitude Death Zone",
        lat: 27.988, lng: 86.925, alt: 1.2,
        spark: "The rooftop of planet Earth, where sea lily fossils near the summit prove it was once the floor of an ancient ocean.",
        explain: "The Indian tectonic plate is colliding into Eurasia at 5 cm per year, crumpling continental crust skyward into vertical rock and ice walls.",
        scale: "At 8,848 m, air pressure is only one-third of sea level, pushing human physiology to its ultimate threshold.",
        wiki: "Mount Everest",
      },
      {
        name: "Oymyakon / Siberia",
        country: "Russia",
        type: "Coldest Inhabited Realm",
        lat: 63.46, lng: 142.78, alt: 1.25,
        spark: "The coldest permanently inhabited settlement on Earth, with recorded winter temperatures plunging to -71.2°C.",
        explain: "Sitting in a deep mountain valley far from warming oceans, dense freezing air sinks into the valley floor creating permanent temperature inversions.",
        scale: "Temperatures are so extreme that boiling water thrown into the air instantly vaporizes into ice crystals.",
        wiki: "Oymyakon",
      },
      {
        name: "Danakil Depression",
        country: "Ethiopia",
        type: "Geothermal Acid Cauldron",
        lat: 14.24, lng: 40.30, alt: 1.2,
        spark: "A surreal neon landscape of bubbling acid lakes, sulfur chimneys, and blinding white mineral crusts.",
        explain: "Located where three tectonic rifts are pulling the Horn of Africa apart, magma warms subterranean groundwater that dissolves ancient marine salt beds.",
        scale: "One of the hottest places on Earth year-round, with daytime temperatures regularly exceeding 50°C.",
        wiki: "Danakil Depression",
      },
      {
        name: "Perito Moreno Glacier",
        country: "Argentina",
        type: "Patagonian Ice Sheet",
        lat: -50.495, lng: -73.137, alt: 1.2,
        spark: "One of the few glaciers on Earth that remains in dynamic equilibrium, advancing forward into icy turquoise waters.",
        explain: "Fueled by constant Pacific storms dumping massive snow on the Southern Patagonian Ice Field, feeding ice that compacts and flows downhill under gravity.",
        scale: "Its towering front wall rises 74 meters above the water and descends 170 meters below.",
        wiki: "Perito Moreno Glacier",
      },
    ]
  },
  {
    id: "isolated-realms",
    title: "Evolution's Isolated Realms",
    subtitle: "Galápagos, Madagascar, Socotra, Amazon, and Antarctica",
    icon: "🦎",
    duration: "5 MINS",
    description: "Journey to deep-sea islands and primordial sanctuaries where life evolved undisturbed in wondrous, alien isolation.",
    stops: [
      {
        name: "Galápagos Islands",
        country: "Ecuador",
        type: "Volcanic Archipelago Sanctuary",
        lat: -0.777, lng: -91.142, alt: 1.15,
        spark: "The world's living laboratory of natural selection, home to swimming marine iguanas and giant 400 kg tortoises.",
        explain: "Formed by underwater volcanic hotspots 1,000 km off the South American coast, animals arrived on driftwood rafts and adapted to unique island niches.",
        scale: "Inspired Charles Darwin's theory of evolution after he observed how finch beak shapes varied from island to island.",
        wiki: "Galápagos Islands",
      },
      {
        name: "Madagascar",
        country: "Madagascar",
        type: "Primordial Island Realm",
        lat: -18.766, lng: 46.869, alt: 1.25,
        spark: "Over 90% of all wildlife found here exists nowhere else on Earth, including 100+ species of playful lemurs and ancient baobab trees.",
        explain: "Split away from the Indian subcontinent 88 million years ago, allowing prehistoric plants and animals to evolve in complete geographic quarantine.",
        scale: "Often called Earth's 'Eighth Continent' because its biodiversity is so utterly unique from Africa.",
        wiki: "Madagascar",
      },
      {
        name: "Socotra Archipelago",
        country: "Yemen",
        type: "The Alien Island of Arabia",
        lat: 12.463, lng: 53.823, alt: 1.15,
        spark: "A surreal landscape of umbrella-shaped Dragon's Blood trees whose red sap was prized as ancient medicine and dye.",
        explain: "Tectonically separated from the Horn of Africa over 20 million years ago, its hyper-arid limestone plateaus forced flora to evolve strange succulent adaptations.",
        scale: "One-third of its 825 plant species are found nowhere else on planet Earth.",
        wiki: "Socotra",
      },
      {
        name: "Amazon Rainforest Basin",
        country: "Brazil",
        type: "Planetary Biodiversity Engine",
        lat: -3.119, lng: -60.021, alt: 1.25,
        spark: "Contains 10% of all known species on Earth and produces 20% of the world's river discharge through dense canopy ecosystems.",
        explain: "A warm, hyper-moist equatorial climate sustained by 'flying rivers'—vapor clouds generated by tree transpiration that cycle rainwater endlessly across the basin.",
        scale: "A single square kilometer of Amazon rainforest can harbor more than 1,000 tree species and 40,000 insect species.",
        wiki: "Amazon rainforest",
      },
      {
        name: "Antarctica Ice Sheet",
        country: "Antarctica",
        type: "Polar Desert Sanctuary",
        lat: -75.25, lng: -0.07, alt: 1.35,
        spark: "The coldest, driest, and windiest continent on Earth, where Emperor penguins huddle through four months of pitch-black polar night.",
        explain: "Locked beneath an ice sheet up to 4.8 km thick, surrounded by the turbulent Antarctic Circumpolar Current that blocks warm equatorial waters.",
        scale: "Holds 70% of the world's freshwater and 90% of all terrestrial ice on Earth.",
        wiki: "Antarctica",
      },
    ]
  },
  {
    id: "great-rivers",
    title: "Great Rivers & Civilizations",
    subtitle: "How the Nile, Amazon, Ganges, Yangtze, and Danube shaped human history",
    icon: "💧",
    duration: "5 MINS",
    description: "Discover how freshwater arteries carved through continents and laid the geographic foundation for human civilizations.",
    stops: [
      {
        name: "Nile River & Cairo",
        country: "Egypt",
        type: "Desert River Oasis",
        lat: 30.044, lng: 31.235, alt: 1.25,
        spark: "Flows 6,650 km through eleven countries to create the single largest agricultural ribbon oasis in world history.",
        explain: "Fed by monsoon rains in the Ethiopian highlands and Lake Victoria, its historical summer floods deposited fertile black volcanic silt along desert banks.",
        scale: "Sustains over 100 million people along a strip of land rarely wider than a few kilometers.",
        wiki: "Nile",
      },
      {
        name: "Amazon River & Manaus",
        country: "Brazil",
        type: "Equatorial Rainforest River",
        lat: -3.119, lng: -60.021, alt: 1.25,
        spark: "Carries more freshwater than the world's next seven largest rivers combined—discharging 209,000 cubic meters every single second.",
        explain: "Drains an enormous 7 million square kilometer basin where equatorial trade winds collide with the Andes Mountains, dropping immense tropical rainfall.",
        scale: "At its mouth, the Amazon pushes freshwater 160 kilometers out into the open Atlantic Ocean.",
        wiki: "Amazon River",
      },
      {
        name: "Ganges & Sundarbans",
        country: "India",
        type: "Sacred Glacial Delta",
        lat: 22.5, lng: 89.0, alt: 1.25,
        spark: "The greatest mangrove delta on Earth, where glacial meltwater creates home for swimming Royal Bengal tigers.",
        explain: "Born in Himalayan glaciers, the Ganges and Brahmaputra carry massive sediment loads that form the world's largest river delta in the Bay of Bengal.",
        scale: "Its fertile river plain is the most densely populated river basin on Earth, home to over 400 million people.",
        wiki: "Ganges",
      },
      {
        name: "Yangtze River & Three Gorges",
        country: "China",
        type: "Cradle of East Asian Civilization",
        lat: 30.827, lng: 111.002, alt: 1.25,
        spark: "Asia's longest river, flowing 6,300 km from the roof of Tibet through majestic limestone canyons to Shanghai.",
        explain: "Cutting through towering mountain folds, it drains one-fifth of China's land area and has supported wet-rice civilization and trade for over 7,000 years.",
        scale: "The river basin produces 40% of China's GDP and is home to nearly one-third of its population.",
        wiki: "Yangtze",
      },
      {
        name: "Danube River & European Capitals",
        country: "Austria",
        type: "Continental Trade Artery",
        lat: 48.208, lng: 16.373, alt: 1.2,
        spark: "Flows eastward through 10 countries and four national capitals—Vienna, Bratislava, Budapest, and Belgrade.",
        explain: "Connects the Black Forest of Germany to the Black Sea, forming a natural physical highway that shaped the borders of the Roman, Ottoman, and Habsburg empires.",
        scale: "Spans 2,850 kilometers, linking Western and Eastern European cultures for thousands of years.",
        wiki: "Danube",
      },
    ]
  }
];

function findCountryForStop(s) {
  if (!s || !s.country || !S.countries) return null;
  const parts = s.country.split(/[/,·]/).map((p) => p.trim());
  for (const part of parts) {
    const direct = S.countries.find((c) => {
      const nm = nameOf(c);
      return nm.toLowerCase() === part.toLowerCase() || nm.toLowerCase().includes(part.toLowerCase());
    });
    if (direct) return direct;
  }
  return null;
}

function openStoryToursModal() {
  const modal = $("#toursModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  const grid = $("#toursGrid");
  grid.innerHTML = STORY_TOURS.map((t) => {
    const done = S.toursCompleted.has(t.id);
    return `
      <div class="tour-card-item" data-tour-id="${t.id}">
        <div>
          <div class="tci-top">
            <span class="tci-icon">${t.icon}</span>
            <span class="tci-badge">${done ? "✅ COMPLETED" : t.duration}</span>
          </div>
          <div class="tci-title">${t.title}</div>
          <div class="tci-desc">${t.description}</div>
        </div>
        <button class="tci-btn">${done ? "Replay Tour →" : "Start Expedition →"}</button>
      </div>`;
  }).join("");

  grid.querySelectorAll(".tour-card-item").forEach((card) => {
    card.addEventListener("click", () => {
      modal.classList.add("hidden");
      startStoryTour(card.dataset.tourId);
    });
  });
}

function closeStoryToursModal() {
  $("#toursModal")?.classList.add("hidden");
}

function startStoryTour(tourId) {
  const tour = STORY_TOURS.find((t) => t.id === tourId);
  if (!tour) return;
  closePanel();
  clearCompare();
  endQuiz(true);
  S.activeTour = { tour, stopIndex: 0 };
  $("#tourActiveHud .tour-hud-card")?.classList.remove("collapsed");
  $("#tourActiveHud")?.classList.remove("hidden");
  renderActiveTourStop();
}

async function renderActiveTourStop() {
  const at = S.activeTour;
  if (!at) return;
  const { tour, stopIndex } = at;
  const s = tour.stops[stopIndex];
  if (!s) return;

  const pad = (n) => String(n).padStart(2, "0");
  $("#thTourTitle").textContent = tour.title;
  if ($("#thStopBadge")) $("#thStopBadge").textContent = `${pad(stopIndex + 1)} / ${pad(tour.stops.length)}`;
  if ($("#thCoordsBadge")) {
    const latStr = `${Math.abs(s.lat).toFixed(2)}° ${s.lat >= 0 ? "N" : "S"}`;
    const lngStr = `${Math.abs(s.lng).toFixed(2)}° ${s.lng >= 0 ? "E" : "W"}`;
    $("#thCoordsBadge").textContent = `${latStr}, ${lngStr}`;
  }
  if ($("#thChapterTag")) $("#thChapterTag").textContent = `CHAPTER ${pad(stopIndex + 1)}`;
  if ($("#thTypeTag")) $("#thTypeTag").textContent = (s.type || "GEOGRAPHY").toUpperCase();

  $("#thLocationName").textContent = s.name;
  $("#thLocationSub").textContent = `${s.country} · ${s.type}`;
  $("#thSparkText").textContent = s.spark;
  $("#thExplainText").textContent = s.explain;
  $("#thScaleText").textContent = s.scale;

  // Animate globe camera smoothly to this stop using viewFor so it's framed in the clear stage
  pauseRotate();
  S.globe.pointOfView(viewFor(s.lat, s.lng, s.alt * stageZoom()), 1400);
  ringPulse(s.lat, s.lng, 3.5, "56,189,248");

  // Fetch real Wikipedia photo asynchronously
  const imgEl = $("#thPhoto");
  imgEl.src = "";
  fetchWiki(s.wiki).then((wiki) => {
    if (S.activeTour && S.activeTour.tour.id === tour.id && S.activeTour.stopIndex === stopIndex) {
      if (wiki?.thumb) {
        imgEl.src = wiki.thumb;
        imgEl.style.display = "";
      } else {
        imgEl.style.display = "none";
      }
    }
  }).catch(() => { imgEl.style.display = "none"; });

  // Update navigation buttons
  $("#tourPrevBtn").disabled = stopIndex === 0;
  $("#tourPrevBtn").style.opacity = stopIndex === 0 ? "0.4" : "1";
  $("#tourNextBtn").textContent = stopIndex === tour.stops.length - 1 ? "Finish Expedition 🏆" : "Next Chapter →";

  // Wire Explore Country button
  const expBtn = $("#tourExploreBtn");
  if (expBtn) {
    expBtn.onclick = () => {
      const targetCountry = findCountryForStop(s);
      if (targetCountry) {
        exitStoryTour();
        selectCountry(targetCountry);
      } else {
        toast(`Exploring ${s.name}`);
      }
    };
  }

  // Arcs between current and next stop
  refreshArcs();
}

function exitStoryTour() {
  S.activeTour = null;
  $("#tourActiveHud")?.classList.add("hidden");
  refreshArcs();
  setMode("explore");
}

function refreshArcs() {
  if (S.globe?.arcsData) {
    S.globe.arcsData(currentArcs());
  }
}

function currentArcs() {
  if (S.compare) {
    const a = S.compare.a, b = S.compare.b;
    const ca = centroidOf(a), cb = centroidOf(b);
    const km = Math.round(haversine(ca, cb));
    return [
      { sLat: ca.lat, sLng: ca.lng, eLat: cb.lat, eLng: cb.lng, km, glow: true },
      { sLat: ca.lat, sLng: ca.lng, eLat: cb.lat, eLng: cb.lng, km, glow: false },
    ];
  }
  if (S.activeTour) {
    const { tour, stopIndex } = S.activeTour;
    const cur = tour.stops[stopIndex];
    const nxt = tour.stops[stopIndex + 1];
    if (nxt) {
      const km = Math.round(haversine(cur, nxt));
      return [
        { sLat: cur.lat, sLng: cur.lng, eLat: nxt.lat, eLng: nxt.lng, km, glow: true },
        { sLat: cur.lat, sLng: cur.lng, eLat: nxt.lat, eLng: nxt.lng, km, glow: false },
      ];
    }
  }
  if (S.quiz?.chainArc) return [S.quiz.chainArc];
  if (S.quiz?.pinpointArc) return [S.quiz.pinpointArc];
  return [];
}

/* ───────────────────────── DATA LOAD ───────────────────────── */
function loaderStep(pct, msg) {
  $("#loaderFill").style.width = pct + "%";
  $("#loaderMsg").textContent = msg;
}

const POP_FALLBACK = { TWN: 23894394, ESH: 587000, VAT: 800, FLK: 3800, UNK: 1587000, ATF: 400, SPM: 5800, WLF: 11400, BLM: 10600, MAF: 32500, SJM: 2900, NIU: 1600, TKL: 1900, VGB: 31000, AIA: 15900, MSR: 4400, FRO: 54000, GGY: 64000, JEY: 103000, PCN: 47 };

function populationMap(wb) {
  const m = new Map();
  if (Array.isArray(wb) && Array.isArray(wb[1])) {
    for (const row of wb[1]) if (row.value != null) m.set(row.countryiso3code, row.value);
    if (m.has("XKX")) m.set("UNK", m.get("XKX"));
  }
  return m;
}

// World Bank answered after the globe was already up: fill the numbers in place
function applyPopulations(m) {
  for (const f of uniqueCountries()) f.gv.population = m.get(f.gv.cca3) ?? POP_FALLBACK[f.gv.cca3] ?? f.gv.population;
  rankCache.delete("population");
  if (S.mode === "atlas") { renderLegend(); renderAtlasReadout(null); refreshPolys(); }
}

async function loadData() {
  loaderStep(10, "Charting the continents…");
  // every download starts at once (they used to queue behind the map)
  // 50m resolution → 241 units incl. micro-states (Bahrain, Singapore, Malta, Monaco, Maldives…)
  const topoP = fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json").then((r) => r.json());
  const rawP = fetch("https://cdn.jsdelivr.net/npm/world-countries@5.1.0/countries.json").then((r) => r.json());
  const popP = fetch("https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&mrnev=1&per_page=400")
    .then((r) => r.json()).catch(() => null);
  const indiaP = fetch("data/india-official.geojson").then((r) => r.json()).catch(() => null);
  const topo = await topoP;
  const features = topojson.feature(topo, topo.objects.countries).features;

  loaderStep(40, "Interviewing 195 countries…");
  let countries = [];
  try {
    // populations: a slow World Bank never holds the globe back — wait ≤ 2.5 s, fill in later otherwise
    const late = new Promise((r) => setTimeout(() => r("late"), 2500));
    const [raw, wb] = await Promise.all([rawP, Promise.race([popP, late])]);
    if (wb === "late") popP.then((j) => { if (j) applyPopulations(populationMap(j)); });
    const popByIso3 = populationMap(wb);
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
  S.antarctica = features.find((f) => f.properties.name === "Antarctica") || null;
  // which countries share a border (indices into S.features) — the new engine colours neighbours differently
  const keep = new Map(S.features.map((f) => [features.indexOf(f), S.features.indexOf(f)]));
  const nb = topojson.neighbors(topo.objects.countries.geometries);
  S.neighbors = S.features.map((f) => nb[features.indexOf(f)].map((j) => keep.get(j)).filter((j) => j !== undefined));

  // Official Survey of India boundary for India (world view)
  loaderStep(68, "Redrawing India, officially…");
  try {
    const ind = await indiaP;
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

  if (S.compare) {
    if (d === S.compare.a) return "rgba(255,209,102,0.72)";
    if (d === S.compare.b) return "rgba(126,224,255,0.72)";
  }

  if (S.mode === "quiz" && S.quiz) {
    if (d === S.hoverD) return "rgba(255,255,255,0.35)";
    return "rgba(120,170,255,0.10)";
  }
  if (S.mode === "atlas") return atlasColor(d);
  if (S.mode === "earth") return "rgba(120,170,255,0.04)";

  if (d === S.selected) return "rgba(255,209,102,0.65)";
  return null; // clean political palette; the engine draws hover itself
}

function polyAltitude(d) {
  if (d.__adm1) return d === S.hoverD ? 0.032 : 0.018;
  if (S.stateView) return 0.004;
  if (S.mode === "atlas") {
    const t = atlasT(d);
    const base = S.atlas3d && t != null ? 0.008 + t * 0.3 : 0.008;
    if (S.compare && (d === S.compare.a || d === S.compare.b)) return base + 0.02;
    return d === S.hoverD || d === S.atlasPick ? base + 0.014 : base;
  }
  if (S.compare && (d === S.compare.a || d === S.compare.b)) return 0.035;
  if (S.mode === "earth") return 0.004;
  if (S.mode === "explore" && d === S.selected) return 0.035;
  if (d === S.hoverD && !(S.mode === "quiz" && S.quiz)) return 0.022;
  if (d === S.hoverD) return 0.016;
  // slight lift so the official India overlay never z-fights neighbours it overlaps
  return d.gv?.cca3 === "IND" ? 0.0095 : 0.007;
}

function polyLabel(d) {
  if (S.mode === "earth") return "";
  if (d.__adm1) {
    return `<div class="globe-tip"><div class="gt-name">📍 ${nameOf(d)}</div><div class="gt-sub">${nameOf(S.stateView.country)} · click for the story</div></div>`;
  }
  if (S.stateView) return "";
  if (S.mode === "quiz" && S.quiz && S.quiz.type !== "capital") return "";
  if (S.comparePick && d.gv && d !== S.selected) {
    return `<div class="globe-tip"><div class="gt-name">⚖️ ${flagEmoji(d.gv.cca2)} ${esc(nameOf(d))}</div><div class="gt-sub">click to compare with ${esc(nameOf(S.selected))}</div></div>`;
  }
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
    .polygonLabel(polyLabel)
    .extrude(S.mode === "atlas" && S.atlas3d && !S.stateView)
    .mapStyle(S.mode === "atlas" || S.stateView ? "political" : S.mapStyle) // data & states need the clean colours
    .outlineCountry(S.compare || S.stateView ? null : S.selected || (S.mode === "atlas" ? S.atlasPick : null));
}

function initGlobe() {
  const el = $("#globeViz");
  S.globe = GeoEngine.create(el, {
      countries: S.features,
      extraLand: S.antarctica ? [S.antarctica] : [],
      neighbors: S.neighbors,
      // the official India outline overlaps neighbouring claims: draw it a hair above, and pick it first
      priority: (f) => (f.gv?.cca3 === "IND" ? 1 : 0),
      liftOf: (f) => (f.gv?.cca3 === "IND" ? 0.0004 : 0),
      textures: { biome: "data/biome.jpg", relief: "data/relief.png" },
      perfMeter: new URLSearchParams(location.search).has("fps"), // ?fps=1 → on-screen performance meter
      onContextLost: (lost) => toast(lost ? "⏸️ The device paused the 3D view — restoring…" : "✨ Back in 3D", 2600),
    })
    .polygonsData(S.features)
    .onPolygonHover((d) => {
      S.hoverD = d;
      el.style.cursor = d && S.mode !== "earth" ? "pointer" : "grab";
      // touch screens have no real hover — the readout follows taps there instead
      if (S.mode === "atlas" && !isCoarse()) renderAtlasReadout(d);
      refreshPolys();
    })
    .onPolygonClick((d, ev, coords) => {
      if (S.quiz?.arcadeMode === "pinpoint") return quizPinpointClick(coords);
      if (S.quiz?.arcadeMode === "mystery") return quizMysteryClick(d, ev);
      if (S.quiz?.type === "wonder") return quizWonderClick(coords);
      handleCountryClick(d, ev);
    })
    // arcs layer — head-to-head comparison
    .arcStartLat((a) => a.sLat)
    .arcStartLng((a) => a.sLng)
    .arcEndLat((a) => a.eLat)
    .arcEndLng((a) => a.eLng)
    .arcColor((a) => a.glow ? ["rgba(255,209,102,0.22)", "rgba(126,224,255,0.22)"] : ["rgba(255,209,102,0.95)", "rgba(126,224,255,0.95)"])
    .arcStroke((a) => a.glow ? 1.9 : 0.55)
    .arcDashLength((a) => a.glow ? 1 : 0.42)
    .arcDashGap((a) => a.glow ? 0 : 0.18)
    .arcDashAnimateTime((a) => a.glow ? 0 : 1700)
    .arcAltitudeAutoScale(ARC_SCALE)
    .arcLabel((a) => `<div class="globe-tip"><div class="gt-name">📏 ${fmtFull.format(a.km)} km</div><div class="gt-sub">between the two centres</div></div>`)
    // labels layer — used by Earth mode
    .labelLat((l) => l.lat)
    .labelLng((l) => l.lng)
    .labelText((l) => l.text)
    .labelSize((l) => l.size)
    .labelColor((l) => l.color)
    .labelLabel((l) => `<div class="globe-tip"><div class="gt-name">${l.emoji || ""} ${titleCase(l.text)}</div><div class="gt-sub">${l.kind} · click to learn</div></div>`)
    .onLabelClick((l) => (l.st ? handleCountryClick(l.st) : l.f ? handleCountryClick(l.f) : openEarthFeature(l)))
    .onLabelHover((l) => { el.style.cursor = l ? "pointer" : "grab"; })
    // paths layer — rivers
    .pathPoints((p) => p.pts)
    .pathPointLat((pt) => pt[0])
    .pathPointLng((pt) => pt[1])
    .pathColor(() => "rgba(110,205,255,0.65)")
    .pathLabel((p) => `<div class="globe-tip"><div class="gt-name">💧 ${p.name}</div><div class="gt-sub">river · click to learn</div></div>`)
    .onPathClick((p) => {
      const mid = p.pts[Math.floor(p.pts.length / 2)];
      openEarthFeature({ text: p.name, kind: "river", emoji: "💧", lat: mid[0], lng: mid[1], pts: riverPoints(p.name) });
    })
    .onPathHover((p) => { el.style.cursor = p ? "pointer" : "grab"; })
    // html layer — only the rich cards: 3D wildlife card, compare distance badge
    .htmlLat((w) => w.lat)
    .htmlLng((w) => w.lng)
    .htmlAltitude((w) => (w.__kind === "life" ? 0.03 : w.alt || 0.012))
    .htmlElement((w) => (w.__kind === "life" ? buildLifeHolo(w) : buildArcBadge(w)))
    .onGlobeClick((coords, ev) => {
      if (S.quiz?.arcadeMode === "pinpoint") return quizPinpointClick(coords);
      if (S.quiz?.type === "wonder") return quizWonderClick(coords);
      if (S.comparePick) return;
      if (S.stateView) return exitStateView();
      if (S.mode === "explore") closePanel();
      if (S.mode === "atlas") $("#touchPreviewPill")?.classList.add("hidden");
    });

  {
    S.globe
      // painted pins: wonders (emoji badges) and tiny nations (dots) — big tap targets, no DOM per pin
      .markerLat((m) => m.lat)
      .markerLng((m) => m.lng)
      .markerIcon((m) => (m.__kind === "micro" ? null : m.emoji))
      .markerCountry((m) => (m.__kind === "micro" ? m.f : null))
      .markerLabel((m) => m.__kind === "micro"
        ? polyLabel(m.f)
        : `<div class="globe-tip"><div class="gt-name">${m.emoji} ${esc(m.name)}</div><div class="gt-sub">${esc(m.kind)} · click to learn</div></div>`)
      .onMarkerHover((m) => { el.style.cursor = m ? "pointer" : "grab"; })
      .onMarkerClick((m, e) => (m.__kind === "micro"
        ? handleCountryClick(m.f, e)
        : openEarthFeature({ text: m.name, kind: m.kind, emoji: m.emoji, wiki: m.wiki, lat: m.lat, lng: m.lng })))
      // country names are decoration (clicks go to the country beneath); physical features are clickable
      .labelClickable((l) => !l.f)
      .labelItalic((l) => !!l.water);
  }

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

}

function pauseRotate() {
  S.globe.controls().autoRotate = false;
  clearTimeout(S.idleTimer);
  S.idleTimer = setTimeout(() => {
    if (S.selected || panelVisible()) return; // never drift away from what you're reading
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
  S.globe.pointOfView(viewFor(lat, lng, viewAltitudeFor(d) * altScale * stageZoom()), ms);
}

/* ── Stage-aware framing ──
   Drawers, docks and sheets cover part of the canvas. We find the centre of the
   still-visible "stage", then solve the perspective camera for how far to rotate
   so the target lands there (exact at every altitude, not a heuristic). */
const navHeight = () => (isMobile() ? $("#modeTabs").offsetHeight : 0);

function stageInsets() {
  const ins = { top: 0, bottom: 0, left: 0, right: 0 };
  if (isMobile()) {
    ins.top = $("#topbar").offsetHeight;
    ins.bottom = navHeight() + tallestSheet();
    const tourHud = $("#tourActiveHud");
    if (tourHud && !tourHud.classList.contains("hidden")) {
      ins.bottom = Math.max(ins.bottom, navHeight() + tourHud.offsetHeight + 10);
    }
    const qHud = $("#quizHud");
    if (qHud && !qHud.classList.contains("hidden")) {
      ins.bottom = Math.max(ins.bottom, navHeight() + qHud.offsetHeight + 10);
    }
  } else {
    ins.top = 70;
    if (panelVisible()) ins.right = innerWidth - $("#panel").getBoundingClientRect().left;
    const dock = ["#atlasDock", "#earthDock"].map($).find((x) => !x.classList.contains("hidden"));
    if (dock) ins.left = Math.max(ins.left, dock.getBoundingClientRect().right);
    const tourHud = $("#tourActiveHud");
    if (tourHud && !tourHud.classList.contains("hidden")) {
      const r = tourHud.getBoundingClientRect();
      if (r.left < innerWidth / 2) ins.left = Math.max(ins.left, r.right + 24);
      else ins.right = Math.max(ins.right, innerWidth - r.left + 24);
    }
    const qHud = $("#quizHud");
    if (qHud && !qHud.classList.contains("hidden")) {
      const r = qHud.getBoundingClientRect();
      if (r.left < innerWidth / 2) ins.left = Math.max(ins.left, r.right + 24);
      else ins.right = Math.max(ins.right, innerWidth - r.left + 24);
    }
  }
  return ins;
}

// Surface arc (degrees) that appears `px` pixels from screen centre for a camera at `alt`.
function arcForScreenOffset(px, alt) {
  const fov = ((S.globe.camera().fov || 50) * Math.PI) / 180;
  const D = 1 + alt, k = Math.tan(fov / 2), half = innerHeight / 2;
  const toPx = (th) => (Math.sin(th) / (D - Math.cos(th))) / k * half;
  const limb = Math.acos(1 / D) * 0.9;
  const target = Math.abs(px);
  let lo = 0, hi = limb;
  if (toPx(hi) <= target) lo = hi;
  else for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; toPx(mid) < target ? (lo = mid) : (hi = mid); }
  return (Math.sign(px) * lo * 180) / Math.PI;
}

// Zoom out a little when the stage is small so the target still fits.
function stageZoom() {
  const ins = stageInsets();
  const frac = isMobile()
    ? (innerHeight - ins.top - ins.bottom) / innerHeight
    : (innerWidth - ins.left - ins.right) / innerWidth;
  return 1 + (1 - clamp(frac, 0.3, 1)) * 0.6;
}

// Camera point-of-view that shows (lat, lng) at the centre of the visible stage.
function viewFor(lat, lng, alt) {
  const ins = stageInsets();
  const dx = (ins.left - ins.right) / 2; // stage centre offset from screen centre (+ = right)
  const dy = (ins.top - ins.bottom) / 2; // (+ = down)
  const ax = arcForScreenOffset(dx, alt), ay = arcForScreenOffset(dy, alt);
  const cosLat = Math.max(0.3, Math.cos((lat * Math.PI) / 180));
  return { lat: clamp(lat + ay, -85, 85), lng: lng - ax / cosLat, altitude: alt };
}

function frameCountry(d, ms = 1000) {
  const { lat, lng } = centroidOf(d);
  S.globe.pointOfView(viewFor(lat, lng, viewAltitudeFor(d) * stageZoom()), ms);
  pauseRotate();
}

// Pulse at one point — or pass an array of {lat, lng} as the first argument for several.
function ringPulse(lat, lng, maxR = 4, color = "255,209,102") {
  S.globe
    .ringsData(Array.isArray(lat) ? lat : [{ lat, lng }])
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

/* ───────────────────────── CAMERA ───────────────────────── */
// One smooth flight onto a country (the engine rises over long hops by itself), then a soft pulse.
function cinematicFlyTo(d) {
  pauseRotate();
  const { lat, lng } = centroidOf(d);
  // framed on the next frame, once the drawer / sheet is on screen
  requestAnimationFrame(() => S.globe.pointOfView(viewFor(lat, lng, viewAltitudeFor(d) * stageZoom()), 1600));
  clearTimeout(cinematicFlyTo._t);
  cinematicFlyTo._t = setTimeout(() => {
    if (S.selected === d) ringPulse(lat, lng, Math.max(2.2, Math.min(9, Math.sqrt(d.gv?.area || 3e5) / 260)));
  }, 1450);
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
  const hot = d === S.hoverD || d === S.atlasPick;
  if (S.atlasMetric === "region") {
    return hexA(REGION_COLORS[c.region] || "#8fa3c8", hot ? 1 : 0.85);
  }
  const t = atlasT(d);
  if (t == null) return "rgba(120,140,170,0.15)";
  const col = d3.color(ATLAS_SCALES[S.atlasMetric].interp(t));
  col.opacity = hot ? 1 : 0.88;
  return col.formatRgb();
}

function atlasTooltip(c) {
  const m = ATLAS_SCALES[S.atlasMetric];
  if (S.atlasMetric === "region") return c.region + (c.subregion ? " · " + c.subregion : "");
  const v = m.get(c);
  return v != null ? m.label(v) : "no data";
}

// Global rank of every country for a metric (#1 = largest). Rebuilt when the data changes.
const rankCache = new Map();
function metricRanks(metric) {
  const m = ATLAS_SCALES[metric];
  if (!m || metric === "region") return null;
  const stamp = `${metric}:${S.wb[metric]?.size ?? "-"}`;
  if (rankCache.get(metric)?.stamp === stamp) return rankCache.get(metric);
  const rows = uniqueCountries()
    .map((f) => [f.gv.cca3, m.get(f.gv)])
    .filter(([, v]) => v != null && v > 0)
    .sort((a, b) => b[1] - a[1]);
  const out = { stamp, total: rows.length, rank: new Map(rows.map(([k], i) => [k, i + 1])) };
  rankCache.set(metric, out);
  return out;
}
function rankOf(metric, d) {
  const r = d?.gv && metricRanks(metric);
  const rank = r?.rank.get(d.gv.cca3);
  return rank ? { rank, total: r.total } : null;
}

function renderAtlasReadout(d) {
  const box = $("#atlasReadout");
  const focus = d || S.atlasPick;
  if (!focus?.gv) {
    box.innerHTML = `<span class="ro-hint">${isCoarse() ? "Tap a country to inspect · Tap again to dive in" : "Hover a country…"}</span>`;
    return;
  }
  const r = rankOf(S.atlasMetric, focus);
  const showOpen = focus === S.atlasPick && !(panelVisible() && S.selected === focus);
  box.innerHTML = `
    <div class="ro-top">${flagEmoji(focus.gv.cca2)} <b>${esc(nameOf(focus))}</b>${r ? `<span class="ro-rank">#${r.rank} of ${r.total}</span>` : ""}</div>
    <div class="ro-val">${atlasTooltip(focus.gv)}</div>
    ${showOpen ? `<button class="ro-open">Open details →</button>` : ""}`;
  box.querySelector(".ro-open")?.addEventListener("click", () => selectCountry(focus));
}

// Touch devices: first tap inspects, second tap (or "Open details") dives in.
function atlasInspect(d) {
  S.atlasPick = d;
  renderAtlasReadout(null);
  renderLegend();
  refreshPolys();
  const { lat, lng } = centroidOf(d);
  ringPulse(lat, lng, 2.4, "255,255,255");
  scheduleUrl();

  const pill = $("#touchPreviewPill");
  if (pill && d?.gv) {
    const fEl = $("#tpFlag");
    const nEl = $("#tpName");
    const vEl = $("#tpValue");
    if (fEl) fEl.textContent = flagEmoji(d.gv.cca2);
    if (nEl) nEl.textContent = nameOf(d);
    const r = rankOf(S.atlasMetric, d);
    const rankText = r ? ` · #${r.rank} of ${r.total}` : "";
    if (vEl) vEl.textContent = `${atlasTooltip(d.gv)}${rankText}`;
    pill.classList.remove("hidden");
    const openBtn = $("#tpOpenBtn");
    if (openBtn) {
      openBtn.onclick = (e) => {
        e.stopPropagation();
        pill.classList.add("hidden");
        selectCountry(d);
      };
    }
  }
}

const wbPending = {};
function ensureIndicator(key) {
  if (!WB_EXTRA[key] || S.wb[key]) return Promise.resolve();
  // one request per indicator, however many callers ask at once
  wbPending[key] ??= (async () => {
    try {
      const j = await fetch(`https://api.worldbank.org/v2/country/all/indicator/${WB_EXTRA[key].code}?format=json&mrnev=1&per_page=400`).then((r) => r.json());
      const map = new Map();
      if (Array.isArray(j) && Array.isArray(j[1])) for (const row of j[1]) if (row.value != null) map.set(row.countryiso3code, row.value);
      S.wb[key] = map;
    } catch (e) {
      toast(`⚠️ Couldn't load ${WB_EXTRA[key].label} data`);
      S.wb[key] = new Map();
    }
  })();
  return wbPending[key];
}

async function setAtlasMetric(metric) {
  S.atlasMetric = metric;
  $$(".metric-btn[data-metric]").forEach((x) => x.classList.toggle("active", x.dataset.metric === metric));
  scheduleUrl();
  if (WB_EXTRA[metric] && !S.wb[metric]) {
    $("#atlasReadout").innerHTML = `<span class="loading-dots">Fetching ${WB_EXTRA[metric].label} from the World Bank</span>`;
    await ensureIndicator(metric);
  }
  renderAtlasReadout(isCoarse() ? null : S.hoverD);
  renderLegend();
  refreshPolys();
}

function renderLegend() {
  const box = $("#legend");
  const focus = S.atlasPick || (S.mode === "atlas" ? S.selected : null);
  if (S.atlasMetric === "region") {
    const on = focus?.gv?.region;
    box.innerHTML = `<div class="legend-cats">` +
      Object.entries(REGION_COLORS).filter(([k]) => k !== "Antarctic")
        .map(([k, c]) => `<div class="legend-cat${k === on ? " on" : ""}"><span class="legend-dot" style="background:${c}"></span>${k}${k === on ? ` <span class="legend-you">← ${flagEmoji(focus.gv.cca2)}</span>` : ""}</div>`).join("") +
      `</div>`;
    return;
  }
  const m = ATLAS_SCALES[S.atlasMetric];
  const stops = d3.range(0, 1.01, 0.1).map((t) => m.interp(t)).join(",");
  const t = focus ? atlasT(focus) : null;
  box.innerHTML = `
    <div class="legend-track">
      <div class="legend-grad" style="background:linear-gradient(90deg,${stops})"></div>
      ${t != null ? `<div class="legend-marker" style="left:${(t * 100).toFixed(1)}%" title="${esc(nameOf(focus))}"><span>${flagEmoji(focus.gv.cca2)}</span></div>` : ""}
    </div>
    <div class="legend-row"><span>${m.label(m.domain[0])}</span><span>${m.label(m.domain[1])}</span></div>
    <div style="margin-top:6px;opacity:.7">${m.log ? "log scale" : "linear scale"} · World Bank & open data</div>`;
}

// Drawer rank badge → paint the globe by that metric with this country pinned on the legend.
async function showInAtlas(d, metric) {
  if (S.mode !== "atlas") setMode("atlas");
  S.atlasPick = d;
  await setAtlasMetric(metric);
  if (!isMobile()) { // desktop has room for dock + drawer side by side
    S.selected = d;
    openPanel(d);
  }
  renderAtlasReadout(null);
  frameCountry(d, 1100);
  const { lat, lng } = centroidOf(d);
  ringPulse(lat, lng, 3, "255,255,255");
  scheduleUrl();
}

/* ───────────────────────── MODES ───────────────────────── */
function setMode(mode) {
  if (mode === "tours") {
    openStoryToursModal();
    return;
  }
  if (mode === S.mode) {
    if (mode === "quiz" && !S.quiz) { $("#quizSetup").classList.remove("hidden"); updateQuizBestLabels(); scheduleUrl(); }
    return;
  }
  if (S.mode === "quiz") endQuiz(true);
  if (S.mode === "earth") clearEarthLayers();
  clearLifePin();
  clearCompare();
  exitStateView(false);
  closePanel();
  closeProgressPop();
  S.atlasPick = null;
  $("#touchPreviewPill")?.classList.add("hidden");

  S.mode = mode;
  document.body.dataset.mode = mode;
  $$(".mode-tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  $("#atlasDock").classList.toggle("hidden", mode !== "atlas");
  $("#earthDock").classList.toggle("hidden", mode !== "earth");
  $("#quizSetup").classList.toggle("hidden", mode !== "quiz");
  $("#quizHud").classList.add("hidden");
  $("#quizResult").classList.add("hidden");

  if (mode === "atlas") {
    renderLegend();
    renderAtlasReadout(null);
    $("#hudHint").textContent = isCoarse()
      ? "Tap a country to inspect · Tap again to dive in"
      : "Hover countries to read the data · Click to dive in";
  } else if (mode === "earth") {
    $("#hudHint").textContent = "Oceans, rivers, ranges, wonders — click anything glowing";
    enterEarthMode();
  } else if (mode === "explore") {
    $("#hudHint").textContent = "Drag to spin · Scroll to zoom · Click a country to dive in";
  } else {
    updateQuizBestLabels();
  }
  refreshHtmlLayer();
  refreshPolys();
  scheduleUrl();
}

/* ───────────────────────── COUNTRY SELECTION ───────────────────────── */
function handleCountryClick(d, ev) {
  if (!d) return;
  if (d.__adm1) return openStatePanel(d);
  if (S.comparePick) return pickCompare(d);
  if (S.stateView) { exitStateView(false); selectCountry(d); return; }
  if (S.mode === "earth") return;
  if (S.mode === "quiz" && S.quiz) {
    if (S.quiz.arcadeMode === "mystery") return quizMysteryClick(d, ev);
    if (S.quiz.arcadeMode === "pinpoint") return;
    return quizMapClick(d, ev);
  }
  if (S.mode === "atlas" && isCoarse() && d.gv && S.atlasPick !== d) return atlasInspect(d);
  selectCountry(d);
}

function selectCountry(d) {
  if (!d) return;
  if (S.mode === "quiz" || S.mode === "earth") setMode("explore");
  clearCompare();
  S.info = null;
  S.selected = d;
  if (S.mode === "atlas") { S.atlasPick = d; renderLegend(); renderAtlasReadout(null); }
  S.panelTab = "overview";
  sfx("select");
  refreshPolys();
  cinematicFlyTo(d);
  openPanel(d);
  scheduleUrl();
}

function markVisited(d) {
  const key = d?.gv?.cca3;
  if (!key || S.visited.has(key)) return;
  S.visited.add(key);
  store.set("gv-visited", [...S.visited]);
  updateProgress();
  const n = visitedCount();
  if (n === 10) toast("🌟 10 countries explored — you're on a roll!");
  if (n === 50) toast("🏅 50 countries! Certified globe-trotter.");
  if (n === 100) toast("👑 100 countries. Legendary.");
}

// Only count a country once its drawer has actually been looked at (not a drive-by drag/tap).
function scheduleExplored(d) {
  clearTimeout(S.dwellTimer);
  S.dwellTimer = setTimeout(() => {
    if (S.selected === d && panelVisible() && !S.compare) markVisited(d);
  }, 1500);
}

const visitedCount = () => uniqueCountries().filter((f) => S.visited.has(f.gv.cca3)).length;

function updateProgress() {
  const total = uniqueCountries().length;
  const n = visitedCount();
  $("#visitedCount").textContent = n;
  $("#totalCount").textContent = total;
  $("#chipFill").style.width = Math.min(100, (n / Math.max(1, total)) * 100) + "%";
  if (!$("#progressPop").classList.contains("hidden")) renderProgressPop();
}

const QUIZ_TYPE_LABEL = {
  find: "📍 Find", capital: "🏛️ Capitals", flag: "🚩 Flags", city: "🏙️ City→Country", borders: "🤝 Neighbours", duel: "📏 Bigger/Smaller", wonder: "✨ Wonder Hunt",
  mystery: "🔍 3-Clue Mystery Hunt", chain: "🔥 Globe Chain", pinpoint: "🎯 Pinpoint Drop", blitz: "⚡ Classic Trivia Blitz"
};
const DIFF_LABEL = { E: "Easy", N: "Normal", H: "Hard" };

function renderProgressPop() {
  const all = uniqueCountries();
  const regions = {};
  for (const f of all) {
    const r = f.gv.region || "Other";
    regions[r] ??= { n: 0, total: 0 };
    regions[r].total++;
    if (S.visited.has(f.gv.cca3)) regions[r].n++;
  }
  const n = visitedCount(), total = all.length;
  const bests = Object.entries(S.bests).sort((a, b) => b[1] - a[1]).slice(0, 3);
  $("#progressPop").innerHTML = `
    <div class="pp-head">
      <b>🌐 Explorer progress</b>
      <button class="pp-close" aria-label="Close progress">✕</button>
    </div>
    <div class="pp-big"><span>${n}</span> / ${total} countries · ${Math.round((n / Math.max(1, total)) * 100)}%</div>
    <div class="pp-regions">
      ${Object.entries(regions).sort().map(([r, v]) => `
        <div class="pp-row">
          <span class="pp-dot" style="background:${REGION_COLORS[r] || "#8fa3c8"}"></span>
          <span class="pp-name">${r}</span>
          <span class="pp-bar"><i style="width:${(v.n / v.total) * 100}%;background:${REGION_COLORS[r] || "#8fa3c8"}"></i></span>
          <span class="pp-num">${v.n}/${v.total}</span>
        </div>`).join("")}
    </div>
    <div class="pp-row pp-wonders">✨ Wonders inspected <b>${WONDERS.filter((w) => S.wondersSeen.has(w.name)).length} / ${WONDERS.length}</b></div>
    ${bests.length ? `<div class="pp-bests">🏆 ${bests.map(([k, v]) => {
        const [t, r, df] = k.split("|");
        return `<span>${QUIZ_TYPE_LABEL[t] || t} · ${r} · ${DIFF_LABEL[df] || df}: <b>${v}</b></span>`;
      }).join("")}</div>` : ""}
    <button class="pp-fly">🎲 Fly to an unexplored country</button>
    <button class="pp-credits">About &amp; credits</button>`;
  $("#progressPop .pp-close").addEventListener("click", closeProgressPop);
  $("#progressPop .pp-fly").addEventListener("click", flyToUnexplored);
  $("#progressPop .pp-credits").addEventListener("click", () => { closeProgressPop(); openCredits(); });
}

function toggleProgressPop() {
  const pop = $("#progressPop");
  const open = pop.classList.contains("hidden");
  if (open) renderProgressPop();
  pop.classList.toggle("hidden", !open);
  $("#progressChip").setAttribute("aria-expanded", String(open));
}

function openCredits() {
  $("#creditsModal").classList.remove("hidden");
  $("#creditsClose").focus();
}
function closeCredits() { $("#creditsModal").classList.add("hidden"); }

function closeProgressPop() {
  $("#progressPop").classList.add("hidden");
  $("#progressChip").setAttribute("aria-expanded", "false");
}

function flyToUnexplored() {
  const left = uniqueCountries().filter((f) => !S.visited.has(f.gv.cca3));
  closeProgressPop();
  if (!left.length) { toast("👑 You've explored every country on Earth!"); return; }
  exitStateView(false);
  selectCountry(left[Math.floor(Math.random() * left.length)]);
}

/* ───────────────────────── PANEL ───────────────────────── */
function setPanelFlag(url, countryName) {
  const img = $("#panelFlag");
  img.style.display = url ? "" : "none";
  if (url) img.src = url;
  img.alt = url && countryName ? `Flag of ${countryName}` : "";
}

function showPanelTabs(show) {
  $("#panelTabs").style.display = show ? "" : "none";
  $("#panelActions").style.display = show ? "" : "none";
}

function openPanel(d) {
  const c = d.gv;
  $("#panel").classList.remove("hidden");
  showPanelTabs(true);
  $("#panelCompare").style.display = c ? "" : "none";
  $("#panelHeader").style.setProperty("--flagbg", c?.flags?.svg ? `url('${c.flags.svg}')` : "none");
  setPanelFlag(c?.flags?.svg, nameOf(d));
  $("#panelName").textContent = `${c ? flagEmoji(c.cca2) + " " : ""}${nameOf(d)}`;
  $("#panelOfficial").textContent = c?.name?.official || "Territory";
  syncTabs();
  renderPanelTab(d);
  scheduleExplored(d);
}

function syncTabs() {
  $$(".ptab").forEach((b) => {
    const on = b.dataset.tab === S.panelTab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
}

function closePanel() {
  $("#panel").classList.add("hidden");
  $("#touchPreviewPill")?.classList.add("hidden");
  clearTimeout(S.dwellTimer);
  clearCompare();
  S.info = null;
  if (S.selected) {
    S.selected = null;
    S.globe.controls().autoRotateSpeed = 0.42;
    refreshPolys();
  }
  if (S.mode === "atlas") renderAtlasReadout(null);
  scheduleUrl();
}

// Generic info panel (states, oceans, rivers, wonders, big ideas)
async function openInfoPanel({ title, subtitle, emoji, wikiTitles, flagUrl, flagName, related }) {
  const token = ++S.panelToken;
  clearCompare();
  $("#panel").classList.remove("hidden");
  showPanelTabs(false);
  $("#panelHeader").style.setProperty("--flagbg", flagUrl ? `url('${flagUrl}')` : "none");
  setPanelFlag(flagUrl, flagName);
  $("#panelName").textContent = title;
  $("#panelOfficial").textContent = subtitle || "";

  const ws = generateWonderStory({ name: title, kind: subtitle });
  const lat = related?.lat != null ? related.lat : null;
  const lng = related?.lng != null ? related.lng : null;
  const coordsStr = (lat != null && lng != null)
    ? `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? "E" : "W"}`
    : "Geodetic Reference";

  const depthElevation = (title.includes("Trench") || subtitle?.includes("Trench")) ? "-11,034 m (Abyss)"
    : (title.includes("Everest") ? "+8,848 m (Peak)"
    : (subtitle?.includes("Volcano") ? "Active Volcanic"
    : (subtitle?.includes("Canyon") ? "1,800 m Depth"
    : (subtitle?.includes("Glacier") ? "Ice Sheet" : "Natural Wonder"))));

  const biomeType = (subtitle?.includes("Ocean") || subtitle?.includes("Sea") || subtitle?.includes("Water")) ? "Marine Aquatic"
    : (subtitle?.includes("Desert") ? "Hyper-Arid Desert"
    : (subtitle?.includes("Rainforest") ? "Tropical Rainforest"
    : (subtitle?.includes("Glacier") ? "Subpolar Glacial"
    : (subtitle?.includes("Mountain") || subtitle?.includes("Range") ? "Alpine Montane" : "Global Biosphere"))));

  const geoStatus = (title.includes("Everest") || title.includes("Canyon") || title.includes("Barrier Reef") || title.includes("Galápagos"))
    ? "UNESCO World Heritage"
    : (subtitle?.includes("Volcano") ? "Active Tectonic Rift" : "Geographic Landmark");

  $("#panelBody").innerHTML = `
    <div class="field-notes-box">
      <div class="field-badge amber">EXPLORER FIELD NOTES · ${esc((subtitle || "GEOGRAPHY").toUpperCase())}</div>
      <div class="story-photo-banner" id="infoPhotoBanner" style="display:none">
        <img id="infoPhotoImg" alt="${esc(title)}" loading="lazy" />
        <div class="story-photo-credit">Wikimedia Commons</div>
      </div>

      <div class="telemetry-strip">
        <div class="telemetry-item">
          <span class="ti-label">Coordinates</span>
          <span class="ti-val accent mono-num">${coordsStr}</span>
        </div>
        <div class="telemetry-item">
          <span class="ti-label">Elevation / Depth</span>
          <span class="ti-val mono-num">${depthElevation}</span>
        </div>
        <div class="telemetry-item">
          <span class="ti-label">Biome Realm</span>
          <span class="ti-val emerald">${biomeType}</span>
        </div>
        <div class="telemetry-item">
          <span class="ti-label">Geological Status</span>
          <span class="ti-val violet">${geoStatus}</span>
        </div>
      </div>

      <div class="story-spark-box">
        <div class="spark-icon">✨</div>
        <div class="spark-text">${ws.spark}</div>
      </div>
      <div class="story-explain-box">
        <div class="seb-label">Why it exists here</div>
        <div class="seb-text">${ws.howItWorks}</div>
      </div>
      <div class="story-scale-box">
        <div class="seb-label">Human-Scale Perspective</div>
        <div class="seb-text">${ws.scale}</div>
      </div>
    </div>
    ${related ? `<div id="relCountries"><div class="section-h">Connected Countries</div><div class="loading-dots">Tracing borders</div></div>` : ""}
    <div class="wiki-block" id="infoWiki"><div class="loading-dots">Consulting geographic archives</div></div>`;
  scheduleUrl();
  if (related) {
    // geometry work runs after the camera flight has started, so it never stutters the animation
    setTimeout(() => {
      if (token !== S.panelToken) return;
      renderRelatedCountries(relatedCountries(related));
    }, 80);
  }
  const wiki = await fetchWikiFirst(wikiTitles);
  if (token !== S.panelToken) return;
  if (wiki?.thumb) {
    const pBanner = $("#infoPhotoBanner");
    const pImg = $("#infoPhotoImg");
    if (pBanner && pImg) {
      pImg.src = wiki.thumb;
      pBanner.style.display = "";
    }
  }
  $("#infoWiki").innerHTML = wikiBlockHtml(wiki);
}

function renderRelatedCountries(list) {
  const box = $("#relCountries");
  if (!box) return;
  if (!list.length) { box.remove(); return; }
  box.innerHTML = `
    <div class="section-h">Countries it touches — tap to jump</div>
    <div class="pill-row">${list.map((f) =>
      `<button class="pill click" data-cca3="${f.gv.cca3}">${flagEmoji(f.gv.cca2)} ${esc(nameOf(f))}</button>`).join("")}</div>`;
  box.querySelectorAll(".pill").forEach((p) =>
    p.addEventListener("click", () => selectCountry(S.byCca3.get(p.dataset.cca3))));
}

/* ── Which countries does a physical feature belong to? ──
   Points (wonders): the containing country, else the nearest coast within ~400 km.
   Land polygons & rivers: countries containing sampled points of the feature.
   Seas & lakes: countries whose coastline runs within ~70 km of the shore. */
function samplePoints(coords, max) {
  if (coords.length <= max) return coords;
  const step = coords.length / max;
  return Array.from({ length: max }, (_, i) => coords[Math.floor(i * step)]);
}

function geomCoords(geom) {
  if (!geom) return [];
  if (geom.type === "Polygon") return geom.coordinates.flat();
  if (geom.type === "MultiPolygon") return geom.coordinates.flat(2);
  if (geom.type === "LineString") return geom.coordinates;
  if (geom.type === "MultiLineString") return geom.coordinates.flat();
  return [];
}

function countryBox(f) {
  if (!f._bbox) {
    const [[w, s], [e, n]] = d3.geoBounds(f);
    f._bbox = w > e ? [-180, s, 180, n] : [w, s, e, n]; // antimeridian-crossing → full width
  }
  return f._bbox;
}

function countryVerts(f) {
  if (!f._verts) f._verts = samplePoints(geomCoords(f.geometry), 160);
  return f._verts;
}

// Approximate distance in degrees of arc (fast equirectangular — fine at ~1° scales)
function degDist([lng1, lat1], [lng2, lat2]) {
  let dl = Math.abs(lng1 - lng2);
  if (dl > 180) dl = 360 - dl;
  const x = dl * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180), y = lat1 - lat2;
  return Math.sqrt(x * x + y * y);
}

// Points spread across a polygon's interior — catches countries deep inside a big region (Algeria in the Sahara)
function interiorPoints(geom, n = 11) {
  const coords = geomCoords(geom);
  let w = 180, s = 90, e = -180, nn = -90;
  for (const [x, y] of coords) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); nn = Math.max(nn, y); }
  const feature = { type: "Feature", geometry: geom };
  const out = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const p = [w + ((i + 0.5) / n) * (e - w), s + ((j + 0.5) / n) * (nn - s)];
    if (d3.geoContains(feature, p)) out.push(p);
  }
  return out;
}

const relatedCache = new Map();
function relatedCountries(feat) {
  if (!feat) return [];
  const key = `${feat.kind}|${feat.text}`;
  if (relatedCache.has(key)) return relatedCache.get(key);

  let pts, mode;
  if (feat.geom && feat.water) { pts = samplePoints(geomCoords(feat.geom), 90); mode = "near"; }
  else if (feat.geom) { pts = [...samplePoints(geomCoords(feat.geom), 70), ...interiorPoints(feat.geom)]; mode = "contain"; }
  else if (feat.pts?.length) { pts = samplePoints(feat.pts.map(([lat, lng]) => [lng, lat]), 80); mode = "contain"; }
  else if (feat.lat != null) { pts = [[feat.lng, feat.lat]]; mode = "point"; }
  else return [];

  // bounding box of the feature, padded a little
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of pts) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  const pad = mode === "point" ? 4 : 1.5;
  const hit = (b) => !(b[0] > e + pad || b[2] < w - pad || b[1] > n + pad || b[3] < s - pad);
  const cands = uniqueCountries().filter((f) => hit(countryBox(f)));

  const score = new Map();
  if (mode !== "near") {
    for (const f of cands) {
      let c = 0;
      for (const p of pts) if (d3.geoContains(f, p)) c++;
      if (c) score.set(f, c);
    }
  }
  if (mode === "near" || (mode === "point" && !score.size)) {
    const thr = mode === "near" ? 0.65 : 3.6; // ≈ 70 km of shore / ≈ 400 km for offshore wonders
    for (const f of cands) {
      const verts = countryVerts(f);
      let c = 0, best = Infinity;
      for (const p of pts) {
        let dmin = Infinity;
        for (const v of verts) { const dd = degDist(p, v); if (dd < dmin) dmin = dd; }
        if (dmin < thr) c++;
        best = Math.min(best, dmin);
      }
      if (c) score.set(f, mode === "point" ? 1 / (best + 0.01) : c);
    }
    if (mode === "point" && score.size > 1) { // offshore wonder → only the nearest nation
      const top = [...score].sort((a, b) => b[1] - a[1])[0];
      score.clear();
      score.set(top[0], top[1]);
    }
  }
  const out = [...score].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([f]) => f);
  relatedCache.set(key, out);
  return out;
}

function statCard(label, value, wide = false) {
  return `<div class="stat-card${wide ? " wide" : ""}"><div class="sc-label">${label}</div><div class="sc-value">${value}</div></div>`;
}

const RANK_METRICS = [
  ["population", "👥", "population"], ["area", "📐", "area"], ["density", "🏙️", "density"],
  ["gdp", "💰", "GDP"], ["gdppc", "💎", "GDP per capita"], ["life", "❤️", "life expectancy"],
];

function rankBadgesHtml(d) {
  return RANK_METRICS.map(([metric, emoji, label]) => {
    const pending = WB_EXTRA[metric] && !S.wb[metric];
    const r = pending ? null : rankOf(metric, d);
    if (!pending && !r) return "";
    return `<button class="rank-badge${pending ? " pending" : ""}" data-metric="${metric}"
        aria-label="${r ? `Ranked ${r.rank} of ${r.total} in ${label} — show on the data map` : `Loading ${label}`}">
        ${emoji} <b>${r ? `#${r.rank}` : "…"}</b> <span>in ${label}</span></button>`;
  }).join("");
}

function wireRankBadges(d) {
  $$("#rankRow .rank-badge:not(.pending)").forEach((b) =>
    b.addEventListener("click", () => showInAtlas(d, b.dataset.metric)));
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
    const story = generateCountryStory(d);
    const centroid = centroidOf(d);
    const coordsStr = `${Math.abs(centroid.lat).toFixed(1)}° ${centroid.lat >= 0 ? "N" : "S"}, ${Math.abs(centroid.lng).toFixed(1)}° ${centroid.lng >= 0 ? "E" : "W"}`;

    body.innerHTML = `
      <div class="story-photo-banner" id="countryPhotoBanner" style="display:none">
        <img id="countryPhotoImg" alt="${nameOf(d)}" loading="lazy" />
        <div class="story-photo-credit">Wikimedia Commons</div>
      </div>

      <div class="geo-identity-card">
        <div class="gic-eyebrow">GEOGRAPHIC IDENTITY · ${c?.region ? c.region.toUpperCase() : "GLOBAL"}</div>
        <h3 class="gic-spark">${story.spark}</h3>
        <p class="gic-explain">${story.howItWorks}</p>
      </div>

      <div class="telemetry-strip" style="margin-bottom:14px">
        <div class="telemetry-item">
          <span class="ti-label">Centroid Coordinates</span>
          <span class="ti-val accent mono-num">${coordsStr}</span>
        </div>
        <div class="telemetry-item">
          <span class="ti-label">Climate Realm</span>
          <span class="ti-val emerald">${c?.subregion || c?.region || "Continental"}</span>
        </div>
        <div class="telemetry-item">
          <span class="ti-label">Flight Distance Scale</span>
          <span class="ti-val amber">${story.flightHours || (c?.area > 1e6 ? "~4-6h across" : "~1-2h across")}</span>
        </div>
      </div>

      ${story.humanScales.length ? `
        <div class="human-scale-grid">
          ${story.humanScales.map((hs) => `
            <div class="hs-card">
              <div class="hs-label">${hs.label}</div>
              <div class="hs-val">${hs.val}</div>
            </div>`).join("")}
        </div>` : ""}

      <div class="stat-grid">
        ${statCard("Capital", c?.capital?.[0] || "—")}
        ${statCard("Population", c?.population != null ? fmt.format(c.population) : "—")}
        ${statCard("Area", c?.area ? fmt.format(c.area) + " km²" : "—")}
        ${statCard("Density", density ? density + " /km²" : "—")}
        ${statCard("Region", c ? `${c.region}${c.subregion ? " · " + c.subregion : ""}` : "—", true)}
      </div>

      <div style="margin: 10px 0 16px;">
        <button id="overviewCompareBtn" class="tour-nav-btn next" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;padding:11px 16px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-svg"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>
          <span>Compare ${nameOf(d)} with another country</span>
        </button>
      </div>

      ${c ? `<div class="section-h">Global ranks — tap one to map it</div><div class="rank-row" id="rankRow">${rankBadgesHtml(d)}</div>` : ""}
      ${langs.length ? `<div class="section-h">Languages</div><div class="pill-row">${langs.map((l) => `<span class="pill">${l}</span>`).join("")}</div>` : ""}
      ${curr.length ? `<div class="section-h">Currency</div><div class="pill-row">${curr.map((l) => `<span class="pill gold">${l}</span>`).join("")}</div>` : ""}
      ${borders.length ? `<div class="section-h">Neighbours — click to hop</div><div class="pill-row">${borders.map((b) => `<button class="pill click" data-cca3="${b.gv.cca3}">${flagEmoji(b.gv.cca2)} ${nameOf(b)}</button>`).join("")}</div>` : ""}
      <div class="wiki-block" id="ovWiki"><div class="loading-dots">Reading the encyclopedia</div></div>`;

    $("#overviewCompareBtn")?.addEventListener("click", () => startCompare(d));
    $$("#panelBody .pill.click").forEach((p) =>
      p.addEventListener("click", () => selectCountry(S.byCca3.get(p.dataset.cca3))));
    wireRankBadges(d);

    // GDP / GDP per capita / life expectancy arrive from the World Bank in the background
    if (c && Object.keys(WB_EXTRA).some((k) => !S.wb[k])) {
      Promise.all(Object.keys(WB_EXTRA).map(ensureIndicator)).then(() => {
        if (token !== S.panelToken || !$("#rankRow")) return;
        $("#rankRow").innerHTML = rankBadgesHtml(d);
        wireRankBadges(d);
      });
    }

    const wiki = await fetchWikiFirst([wikiTitle(d)]);
    if (token !== S.panelToken) return;
    if (wiki?.thumb) {
      const pBanner = $("#countryPhotoBanner");
      const pImg = $("#countryPhotoImg");
      if (pBanner && pImg) {
        pImg.src = wiki.thumb;
        pBanner.style.display = "";
      }
    }
    $("#ovWiki").innerHTML = wikiBlockHtml(wiki);
  }

  else if (tab === "wildlife") {
    renderWildlife(d, body, token);
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
// geoBoundaries polygons are wound RFC7946-style (CCW outer rings); the globe renderer follows the
// d3 convention, so a wrong-wound ring fills the REST of the planet (giant sphere-swallowing polygon).
// Rewind every ring so the enclosed area is the small side.
const ringArea = (ring) => d3.geoArea({ type: "Polygon", coordinates: [ring] });
function rewindRings(rings) {
  if (!rings?.length) return;
  if (ringArea(rings[0]) > 2 * Math.PI) rings[0].reverse();          // outer ring encloses the state…
  for (let i = 1; i < rings.length; i++) {
    if (ringArea(rings[i]) < 2 * Math.PI) rings[i].reverse();        // …holes are wound the opposite way
  }
}
function rewindGeom(geom) {
  if (geom?.type === "Polygon") rewindRings(geom.coordinates);
  else if (geom?.type === "MultiPolygon") geom.coordinates.forEach(rewindRings);
}

// Some "simplified" ADM1 files are still enormous — thin dense rings so the renderer never freezes.
function slimGeom(geom, budget = 1500) {
  const polys = geom?.type === "Polygon" ? [geom.coordinates] : geom?.type === "MultiPolygon" ? geom.coordinates : [];
  const total = polys.reduce((s, p) => s + p.reduce((s2, r) => s2 + r.length, 0), 0);
  const step = Math.ceil(total / budget);
  if (step <= 1) return;
  for (const p of polys) {
    for (let i = 0; i < p.length; i++) {
      const r = p[i];
      if (r.length <= 12) continue;
      const out = [];
      for (let j = 0; j < r.length - 1; j += step) out.push(r[j]);
      out.push(r[r.length - 1]); // keep the ring closed
      if (out.length >= 4) p[i] = out;
    }
  }
}

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
  feats.forEach((f, i) => {
    f.__adm1 = true;
    f.__idx = i;
    slimGeom(f.geometry);   // keep the renderer fast on huge files
    rewindGeom(f.geometry); // fix inverted polygons that swallow the globe
  });
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
  refreshHtmlLayer();
  flyTo(countryD, 1400, 0.9);
  pauseRotate();
  scheduleUrl();
}

function exitStateView(refocusHint = true) {
  if (!S.stateView) return;
  S.stateView = null;
  S.info = null;
  S.globe.polygonsData(S.features);
  $("#stateBar").classList.add("hidden");
  $("#panel").classList.add("hidden");
  $("#hudHint").textContent = "Drag to spin · Scroll to zoom · Click a country to dive in";
  refreshPolys();
  refreshHtmlLayer();
  if (refocusHint) S.globe.pointOfView({ altitude: 2.2 }, 900);
  scheduleUrl();
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
    flagName: nameOf(countryD),
    wikiTitles: [stName, `${stName}, ${nameOf(countryD)}`, `${stName} (state)`],
  });
  S.info = { type: "state", title: stName };
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

// Every named class in the 50m regions layer → [display kind, colour, emoji].
// (50m stores the class under `featureclass`; 110m used `featurecla`.)
const REGION_KINDMAP = {
  "Range/mtn":    ["mountain range", "#ffcf8a", "🏔️"],
  "Desert":       ["desert", "#ffd8a1", "🏜️"],
  "Plateau":      ["plateau", "#e8c39a", "🗻"],
  "Basin":        ["basin", "#c9d7a6", "🗺️"],
  "Plain":        ["plain", "#d7e3a6", "🌾"],
  "Lowland":      ["lowland", "#d7e3a6", "🌾"],
  "Tundra":       ["tundra", "#cfe6e0", "🥶"],
  "Wetlands":     ["wetlands", "#9fe8c8", "🪷"],
  "Delta":        ["river delta", "#9fe8ff", "💧"],
  "Valley":       ["valley", "#d0e3a1", "🏞️"],
  "Gorge":        ["gorge", "#d8b26e", "🪨"],
  "Foothills":    ["foothills", "#e0c79a", "⛰️"],
  "Coast":        ["coast", "#a5d8e2", "🏖️"],
  "Island":       ["island", "#a5e2c8", "🏝️"],
  "Island group": ["island group", "#a5e2c8", "🏝️"],
  "Peninsula":    ["peninsula", "#b9e2a5", "🗺️"],
  "Pen/cape":     ["cape", "#b9e2a5", "🗺️"],
  "Isthmus":      ["isthmus", "#b9e2a5", "🗺️"],
  "Geoarea":      ["region", "#c8cfe0", "🗺️"],
  "Continent":    ["continent", "#c8cfe0", "🌍"],
};

function loadEarthData() {
  if (S.earth) return Promise.resolve(S.earth);
  if (S.earthPromise) return S.earthPromise;
  // 50m everywhere → ~120 named oceans/seas, ~525 ranges/deserts/plateaus, far more lakes.
  S.earthPromise = Promise.all([
    fetch(`${NE}/ne_50m_geography_marine_polys.geojson`).then((r) => r.json()),
    fetch(`${NE}/ne_50m_geography_regions_polys.geojson`).then((r) => r.json()),
    fetch(`${NE}/ne_50m_lakes.geojson`).then((r) => r.json()),
    fetch(`${NE}/ne_50m_rivers_lake_centerlines.geojson`).then((r) => r.json()),
  ]).then(([marine, regions, lakes, rivers]) => {
    const cls = (f) => f.properties.featureclass || f.properties.featurecla || "";
    const label = (f, kind, color, emoji, sizeBase, water = false) => {
      const [lng, lat] = d3.geoCentroid(f);
      const sr = f.properties.scalerank ?? 5;
      // geom + water let us work out which countries the feature touches
      return { lat, lng, text: f.properties.name, kind, color, emoji, size: Math.max(0.5, sizeBase - sr * 0.13), geom: f.geometry, water };
    };
    const MARINE_EMOJI = { ocean: "🌊", sea: "🌊", gulf: "🌊", bay: "🚢", strait: "↔️", channel: "↔️", sound: "🌊", reef: "🐠", river: "💧" };
    const marineLabels = marine.features
      .filter((f) => f.properties.name)
      .map((f) => {
        const k = cls(f).toLowerCase();
        return label(f, k || "ocean", k === "reef" ? "#9fe8c8" : "#7fd4ff", MARINE_EMOJI[k] || "🌊", 1.9, true);
      });
    const regionLabels = regions.features
      .filter((f) => f.properties.name && REGION_KINDMAP[cls(f)])
      .map((f) => {
        const [kind, color, emoji] = REGION_KINDMAP[cls(f)];
        return label(f, kind, color, emoji, 1.5);
      });
    const lakeLabels = lakes.features
      .filter((f) => f.properties.name)
      .map((f) => label(f, "lake", "#9fe8ff", "💧", 1.2, true));
    const riverPaths = [];
    for (const f of rivers.features) {
      if (!f.properties.name) continue;
      const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const line of lines) {
        if (line.length < 2) continue;
        riverPaths.push({ name: f.properties.name, pts: line.map(([lng, lat]) => [lat, lng]) });
      }
    }
    S.earth = { marineLabels, regionLabels, lakeLabels, riverPaths };
    S.searchIndex = null; // physical features become searchable
    return S.earth;
  });
  S.earthPromise.catch(() => { S.earthPromise = null; }); // allow a retry after a network failure
  return S.earthPromise;
}

// All segments of a named river, as [lat, lng] points
function riverPoints(name) {
  return (S.earth?.riverPaths || []).filter((p) => p.name === name).flatMap((p) => p.pts);
}

async function enterEarthMode() {
  const zoom = !S.earthNoZoom; // a search jump flies to its own target instead
  S.earthNoZoom = false;
  if (!S.earth) {
    toast("🌋 Loading Earth's physical features…");
    try { await loadEarthData(); }
    catch (e) { toast("⚠️ Couldn't load physical geography layers"); return; }
    if (S.mode !== "earth") return; // user switched away while loading
  }
  applyEarthLayers();
  if (zoom) S.globe.pointOfView({ altitude: 2.5 }, 1200);
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
    .pathsData(L.rivers ? S.earth.riverPaths : []);
  refreshHtmlLayer();
}

function clearEarthLayers() {
  S.globe.labelsData([]).pathsData([]);
  refreshHtmlLayer();
}

function openEarthFeature(l) {
  if (!l) return;
  const title = titleCase(l.text);
  if (WONDERS.some((w) => w.name === l.text) && !S.wondersSeen.has(l.text)) {
    S.wondersSeen.add(l.text);
    store.set("gv-wonders", [...S.wondersSeen]);
  }
  openInfoPanel({
    title,
    subtitle: l.kind,
    emoji: l.emoji || "🌍",
    wikiTitles: [l.wiki, title, `${title} (${l.kind})`, `${title} River`],
    related: l,
  });
  S.info = { type: "feature", title: l.text, kind: l.kind };
  if (l.lat != null) {
    // framed after the drawer/sheet is open, so the feature sits in the visible area
    S.globe.pointOfView(viewFor(l.lat, l.lng, 1.1 * stageZoom()), 1000);
    pauseRotate();
  }
}

// Open a physical feature from anywhere (search, deep link, quiz review)
function openPhysical(l) {
  if (S.mode !== "earth") { S.earthNoZoom = true; setMode("earth"); }
  openEarthFeature(l);
}

// Resolve a feature name (from a URL / review) against wonders, labels and rivers
async function findPhysical(name) {
  const key = normalize(name); // Natural Earth mixes "ANDES" and "Mediterranean Sea"
  const w = WONDERS.find((x) => normalize(x.name) === key);
  if (w) return { text: w.name, kind: w.kind, emoji: w.emoji, lat: w.lat, lng: w.lng };
  try { await loadEarthData(); } catch (e) { return null; }
  const all = [...S.earth.marineLabels, ...S.earth.regionLabels, ...S.earth.lakeLabels];
  const l = all.find((x) => normalize(x.text) === key);
  if (l) return l;
  const river = S.earth.riverPaths.find((p) => normalize(p.name) === key)?.name;
  const pts = river ? riverPoints(river) : [];
  if (pts.length) {
    const mid = pts[Math.floor(pts.length / 2)];
    return { text: river, kind: "river", emoji: "💧", lat: mid[0], lng: mid[1], pts };
  }
  return null;
}

function openBigIdeas() {
  ++S.panelToken;
  clearCompare();
  S.info = { type: "ideas" };
  $("#panel").classList.remove("hidden");
  showPanelTabs(false);
  $("#panelHeader").style.setProperty("--flagbg", "none");
  setPanelFlag(null);
  scheduleUrl();
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

/* ───────────────────────── WILDLIFE & FLORA ───────────────────────── */
// n = name (used for Wikipedia + 3D search), e = emoji, t = type
const A = (n, e, t) => ({ n, e, t });
const MAMMAL = "mammal", BIRD = "bird", REPTILE = "reptile", SEA = "marine", PLANT = "plant", AMPH = "amphibian", INSECT = "insect";

const WILDLIFE_BY_CCA3 = {
  IND: [A("Bengal tiger","🐯",MAMMAL),A("Indian elephant","🐘",MAMMAL),A("Indian peafowl","🦚",BIRD),A("Indian rhinoceros","🦏",MAMMAL),A("King cobra","🐍",REPTILE),A("Asiatic lion","🦁",MAMMAL),A("Sacred lotus","🪷",PLANT),A("Banyan","🌳",PLANT)],
  CHN: [A("Giant panda","🐼",MAMMAL),A("Golden snub-nosed monkey","🐒",MAMMAL),A("Red-crowned crane","🦤",BIRD),A("South China tiger","🐯",MAMMAL),A("Chinese alligator","🐊",REPTILE),A("Ginkgo","🌳",PLANT),A("Moso bamboo","🎋",PLANT)],
  USA: [A("Bald eagle","🦅",BIRD),A("American bison","🦬",MAMMAL),A("Grizzly bear","🐻",MAMMAL),A("Gray wolf","🐺",MAMMAL),A("American alligator","🐊",REPTILE),A("Giant sequoia","🌲",PLANT),A("Saguaro","🌵",PLANT)],
  BRA: [A("Jaguar","🐆",MAMMAL),A("Giant anteater","🐜",MAMMAL),A("Scarlet macaw","🦜",BIRD),A("Green anaconda","🐍",REPTILE),A("Capybara","🦫",MAMMAL),A("Golden lion tamarin","🐒",MAMMAL),A("Brazilwood","🌳",PLANT),A("Victoria amazonica","🪷",PLANT)],
  AUS: [A("Red kangaroo","🦘",MAMMAL),A("Koala","🐨",MAMMAL),A("Platypus","🦫",MAMMAL),A("Emu","🦤",BIRD),A("Saltwater crocodile","🐊",REPTILE),A("Kookaburra","🐦",BIRD),A("Eucalyptus","🌳",PLANT),A("Golden wattle","🌼",PLANT)],
  ZAF: [A("Lion","🦁",MAMMAL),A("African elephant","🐘",MAMMAL),A("Leopard","🐆",MAMMAL),A("Southern white rhino","🦏",MAMMAL),A("Cape buffalo","🐃",MAMMAL),A("Springbok","🦌",MAMMAL),A("King protea","🌸",PLANT),A("Baobab","🌳",PLANT)],
  KEN: [A("Lion","🦁",MAMMAL),A("African elephant","🐘",MAMMAL),A("Masai giraffe","🦒",MAMMAL),A("Black rhinoceros","🦏",MAMMAL),A("Cheetah","🐆",MAMMAL),A("Greater flamingo","🦩",BIRD),A("Acacia","🌳",PLANT)],
  TZA: [A("Lion","🦁",MAMMAL),A("Wildebeest","🐃",MAMMAL),A("African elephant","🐘",MAMMAL),A("Masai giraffe","🦒",MAMMAL),A("Cheetah","🐆",MAMMAL),A("Baobab","🌳",PLANT)],
  IDN: [A("Sumatran tiger","🐯",MAMMAL),A("Bornean orangutan","🦧",MAMMAL),A("Komodo dragon","🦎",REPTILE),A("Javan rhinoceros","🦏",MAMMAL),A("Sumatran elephant","🐘",MAMMAL),A("Rafflesia","🌺",PLANT)],
  RUS: [A("Siberian tiger","🐯",MAMMAL),A("Brown bear","🐻",MAMMAL),A("Eurasian lynx","🐈",MAMMAL),A("Reindeer","🦌",MAMMAL),A("Steller's sea eagle","🦅",BIRD),A("Siberian pine","🌲",PLANT)],
  CAN: [A("Moose","🫎",MAMMAL),A("Canada lynx","🐈",MAMMAL),A("Polar bear","🐻‍❄️",MAMMAL),A("Beaver","🦫",MAMMAL),A("Common loon","🦆",BIRD),A("Sugar maple","🍁",PLANT)],
  JPN: [A("Japanese macaque","🐒",MAMMAL),A("Red-crowned crane","🦤",BIRD),A("Sika deer","🦌",MAMMAL),A("Japanese giant salamander","🦎",AMPH),A("Koi","🐟",SEA),A("Cherry blossom","🌸",PLANT)],
  MEX: [A("Jaguar","🐆",MAMMAL),A("Axolotl","🦎",AMPH),A("Golden eagle","🦅",BIRD),A("Vaquita","🐬",SEA),A("Spider monkey","🐒",MAMMAL),A("Monarch butterfly","🦋",INSECT),A("Agave","🌵",PLANT)],
  EGY: [A("Dromedary camel","🐪",MAMMAL),A("Fennec fox","🦊",MAMMAL),A("Nile crocodile","🐊",REPTILE),A("Egyptian vulture","🦅",BIRD),A("Papyrus","🌾",PLANT),A("Date palm","🌴",PLANT)],
  NPL: [A("Bengal tiger","🐯",MAMMAL),A("Snow leopard","🐆",MAMMAL),A("Red panda","🦝",MAMMAL),A("One-horned rhinoceros","🦏",MAMMAL),A("Himalayan monal","🐦",BIRD),A("Rhododendron","🌺",PLANT)],
  GBR: [A("Red fox","🦊",MAMMAL),A("European badger","🦡",MAMMAL),A("Red deer","🦌",MAMMAL),A("European robin","🐦",BIRD),A("Atlantic puffin","🐧",BIRD),A("English oak","🌳",PLANT)],
  DEU: [A("Red fox","🦊",MAMMAL),A("Wild boar","🐗",MAMMAL),A("Red deer","🦌",MAMMAL),A("White stork","🦤",BIRD),A("European oak","🌳",PLANT)],
  FRA: [A("Red fox","🦊",MAMMAL),A("Alpine ibex","🐐",MAMMAL),A("Wild boar","🐗",MAMMAL),A("Golden eagle","🦅",BIRD),A("Lavender","💜",PLANT)],
  ESP: [A("Iberian lynx","🐈",MAMMAL),A("Iberian wolf","🐺",MAMMAL),A("Spanish imperial eagle","🦅",BIRD),A("Brown bear","🐻",MAMMAL),A("Cork oak","🌳",PLANT)],
  NOR: [A("Reindeer","🦌",MAMMAL),A("Arctic fox","🦊",MAMMAL),A("Moose","🫎",MAMMAL),A("Atlantic puffin","🐧",BIRD),A("Norway spruce","🌲",PLANT)],
  ARG: [A("Jaguar","🐆",MAMMAL),A("Guanaco","🦙",MAMMAL),A("Andean condor","🦅",BIRD),A("Magellanic penguin","🐧",BIRD),A("Capybara","🦫",MAMMAL),A("Ombú","🌳",PLANT)],
  PER: [A("Andean condor","🦅",BIRD),A("Llama","🦙",MAMMAL),A("Spectacled bear","🐻",MAMMAL),A("Vicuña","🦙",MAMMAL),A("Giant otter","🦦",MAMMAL),A("Cinchona","🌳",PLANT)],
  CHL: [A("Puma","🐆",MAMMAL),A("Guanaco","🦙",MAMMAL),A("Andean condor","🦅",BIRD),A("Humboldt penguin","🐧",BIRD),A("Monkey puzzle tree","🌲",PLANT)],
  COD: [A("Okapi","🦌",MAMMAL),A("Eastern gorilla","🦍",MAMMAL),A("Bonobo","🦧",MAMMAL),A("Forest elephant","🐘",MAMMAL),A("African teak","🌳",PLANT)],
  MDG: [A("Ring-tailed lemur","🦝",MAMMAL),A("Fossa","🐈",MAMMAL),A("Panther chameleon","🦎",REPTILE),A("Indri","🐒",MAMMAL),A("Baobab","🌳",PLANT)],
  THA: [A("Indochinese tiger","🐯",MAMMAL),A("Asian elephant","🐘",MAMMAL),A("Gaur","🐃",MAMMAL),A("White-handed gibbon","🐒",MAMMAL),A("Siamese fighting fish","🐟",SEA),A("Golden shower tree","🌼",PLANT)],
  NZL: [A("Kiwi","🥝",BIRD),A("Kea","🦜",BIRD),A("Tuatara","🦎",REPTILE),A("Yellow-eyed penguin","🐧",BIRD),A("Silver fern","🌿",PLANT),A("Kauri","🌲",PLANT)],
  SAU: [A("Arabian oryx","🦌",MAMMAL),A("Dromedary camel","🐪",MAMMAL),A("Arabian leopard","🐆",MAMMAL),A("Sand cat","🐈",MAMMAL),A("Date palm","🌴",PLANT)],
  MNG: [A("Snow leopard","🐆",MAMMAL),A("Bactrian camel","🐫",MAMMAL),A("Przewalski's horse","🐎",MAMMAL),A("Golden eagle","🦅",BIRD),A("Gobi bear","🐻",MAMMAL)],
  ETH: [A("Ethiopian wolf","🐺",MAMMAL),A("Gelada","🐒",MAMMAL),A("Walia ibex","🐐",MAMMAL),A("Lion","🦁",MAMMAL),A("Coffee plant","☕",PLANT)],
  COL: [A("Andean condor","🦅",BIRD),A("Jaguar","🐆",MAMMAL),A("Spectacled bear","🐻",MAMMAL),A("Pink river dolphin","🐬",SEA),A("Cattleya orchid","🌸",PLANT)],
};

const WILDLIFE_BY_SUBREGION = {
  "Eastern Africa": [A("Lion","🦁",MAMMAL),A("African elephant","🐘",MAMMAL),A("Giraffe","🦒",MAMMAL),A("Cheetah","🐆",MAMMAL),A("Greater flamingo","🦩",BIRD),A("Acacia","🌳",PLANT)],
  "Western Africa": [A("African forest elephant","🐘",MAMMAL),A("Western gorilla","🦍",MAMMAL),A("Chimpanzee","🐒",MAMMAL),A("Hippopotamus","🦛",MAMMAL),A("Baobab","🌳",PLANT)],
  "Middle Africa": [A("Western lowland gorilla","🦍",MAMMAL),A("Forest elephant","🐘",MAMMAL),A("Mandrill","🐒",MAMMAL),A("African grey parrot","🦜",BIRD),A("Okoumé","🌳",PLANT)],
  "Southern Africa": [A("Lion","🦁",MAMMAL),A("African elephant","🐘",MAMMAL),A("Leopard","🐆",MAMMAL),A("Meerkat","🦡",MAMMAL),A("Baobab","🌳",PLANT)],
  "Northern Africa": [A("Dromedary camel","🐪",MAMMAL),A("Fennec fox","🦊",MAMMAL),A("Barbary macaque","🐒",MAMMAL),A("Addax","🦌",MAMMAL),A("Date palm","🌴",PLANT)],
  "South-Eastern Asia": [A("Asian elephant","🐘",MAMMAL),A("Malayan tiger","🐯",MAMMAL),A("Orangutan","🦧",MAMMAL),A("Proboscis monkey","🐒",MAMMAL),A("Rafflesia","🌺",PLANT)],
  "Southern Asia": [A("Bengal tiger","🐯",MAMMAL),A("Asian elephant","🐘",MAMMAL),A("Leopard","🐆",MAMMAL),A("Indian peafowl","🦚",BIRD),A("Lotus","🪷",PLANT)],
  "Eastern Asia": [A("Sika deer","🦌",MAMMAL),A("Asian black bear","🐻",MAMMAL),A("Red-crowned crane","🦤",BIRD),A("Raccoon dog","🦝",MAMMAL),A("Bamboo","🎋",PLANT)],
  "Western Asia": [A("Arabian oryx","🦌",MAMMAL),A("Dromedary camel","🐪",MAMMAL),A("Persian leopard","🐆",MAMMAL),A("Golden eagle","🦅",BIRD),A("Date palm","🌴",PLANT)],
  "Central Asia": [A("Snow leopard","🐆",MAMMAL),A("Bactrian camel","🐫",MAMMAL),A("Saiga antelope","🦌",MAMMAL),A("Golden eagle","🦅",BIRD)],
  "South America": [A("Jaguar","🐆",MAMMAL),A("Andean condor","🦅",BIRD),A("Llama","🦙",MAMMAL),A("Capybara","🦫",MAMMAL),A("Scarlet macaw","🦜",BIRD),A("Cattleya orchid","🌸",PLANT)],
  "Central America": [A("Jaguar","🐆",MAMMAL),A("Resplendent quetzal","🦜",BIRD),A("Baird's tapir","🐗",MAMMAL),A("Howler monkey","🐒",MAMMAL),A("Ceiba","🌳",PLANT)],
  "Caribbean": [A("West Indian manatee","🦭",SEA),A("Cuban crocodile","🐊",REPTILE),A("Hispaniolan solenodon","🐭",MAMMAL),A("Green sea turtle","🐢",SEA),A("Royal palm","🌴",PLANT)],
  "Northern America": [A("Bald eagle","🦅",BIRD),A("American bison","🦬",MAMMAL),A("Grizzly bear","🐻",MAMMAL),A("Moose","🫎",MAMMAL),A("Coast redwood","🌲",PLANT)],
  "Northern Europe": [A("Red deer","🦌",MAMMAL),A("Reindeer","🦌",MAMMAL),A("Red fox","🦊",MAMMAL),A("Atlantic puffin","🐧",BIRD),A("Scots pine","🌲",PLANT)],
  "Western Europe": [A("Red fox","🦊",MAMMAL),A("Red deer","🦌",MAMMAL),A("Wild boar","🐗",MAMMAL),A("Grey heron","🐦",BIRD),A("European oak","🌳",PLANT)],
  "Southern Europe": [A("Iberian lynx","🐈",MAMMAL),A("Alpine ibex","🐐",MAMMAL),A("Golden eagle","🦅",BIRD),A("Loggerhead sea turtle","🐢",SEA),A("Olive tree","🫒",PLANT)],
  "Eastern Europe": [A("European bison","🦬",MAMMAL),A("Grey wolf","🐺",MAMMAL),A("Brown bear","🐻",MAMMAL),A("White stork","🦤",BIRD),A("Silver birch","🌳",PLANT)],
  "Australia and New Zealand": [A("Red kangaroo","🦘",MAMMAL),A("Koala","🐨",MAMMAL),A("Kiwi","🥝",BIRD),A("Emu","🦤",BIRD),A("Eucalyptus","🌳",PLANT)],
  "Melanesia": [A("Birds-of-paradise","🐦",BIRD),A("Cassowary","🦤",BIRD),A("Tree kangaroo","🦘",MAMMAL),A("Coconut palm","🌴",PLANT)],
  "Polynesia": [A("Green sea turtle","🐢",SEA),A("Humpback whale","🐋",SEA),A("Fruit bat","🦇",MAMMAL),A("Coconut palm","🌴",PLANT)],
  "Micronesia": [A("Green sea turtle","🐢",SEA),A("Reef shark","🦈",SEA),A("Fruit bat","🦇",MAMMAL),A("Coconut palm","🌴",PLANT)],
};

const WILDLIFE_BY_REGION = {
  Africa: [A("Lion","🦁",MAMMAL),A("African elephant","🐘",MAMMAL),A("Giraffe","🦒",MAMMAL),A("Hippopotamus","🦛",MAMMAL),A("Baobab","🌳",PLANT)],
  Americas:[A("Jaguar","🐆",MAMMAL),A("Bald eagle","🦅",BIRD),A("Andean condor","🦅",BIRD),A("Capybara","🦫",MAMMAL),A("Ceiba","🌳",PLANT)],
  Asia:   [A("Tiger","🐯",MAMMAL),A("Asian elephant","🐘",MAMMAL),A("Giant panda","🐼",MAMMAL),A("Snow leopard","🐆",MAMMAL),A("Bamboo","🎋",PLANT)],
  Europe: [A("Red fox","🦊",MAMMAL),A("Red deer","🦌",MAMMAL),A("Brown bear","🐻",MAMMAL),A("Golden eagle","🦅",BIRD),A("European oak","🌳",PLANT)],
  Oceania:[A("Red kangaroo","🦘",MAMMAL),A("Koala","🐨",MAMMAL),A("Cassowary","🦤",BIRD),A("Green sea turtle","🐢",SEA),A("Eucalyptus","🌳",PLANT)],
};

const TYPE_LABEL = { mammal: "Mammal", bird: "Bird", reptile: "Reptile", marine: "Marine life", plant: "Plant", amphibian: "Amphibian", insect: "Insect" };

function wildlifeFor(d) {
  const c = d.gv;
  if (!c) return WILDLIFE_BY_REGION.Africa;
  const specific = WILDLIFE_BY_CCA3[c.cca3];
  if (specific && specific.length) return specific;
  return WILDLIFE_BY_SUBREGION[c.subregion] || WILDLIFE_BY_REGION[c.region] || WILDLIFE_BY_REGION.Asia;
}

/* ── On-globe 3D wildlife: a holographic model card pinned to the planet ── */
// globe.gl rewrites each html element's inline transform every frame to centre it on its point.
// A zero-size anchor takes that transform, so the child can sit *above* the point and animate freely.
function anchorWrap(inner) {
  const a = document.createElement("div");
  a.className = "html-anchor";
  a.appendChild(inner);
  return a;
}

/* ── Tiny nations: pins + forgiving hit-testing so every country is tappable ── */
const MICRO_SR = 3.2e-4; // ≈ 13,000 km² of sphere — Bahrain, Malta, Singapore, Maldives, Caribbean & Pacific states…

function initMicroStates() {
  S.micro = uniqueCountries()
    .filter((f) => d3.geoArea(f) < MICRO_SR)
    .map((f) => {
      const [lat, lng] = f.gv.latlng?.length === 2 ? f.gv.latlng : [centroidOf(f).lat, centroidOf(f).lng];
      return { __kind: "micro", f, lat, lng };
    });
  S.microSet = new Set(S.micro.map((m) => m.f));
}

// Pins only where picking a country is the task (never in tours or quiz modes)
function microActive() {
  if (!S.pins || S.stateView || S.mode === "earth" || S.activeTour || S.mode === "quiz") return false;
  return true;
}

function setPins(on) {
  S.pins = on;
  store.set("gv-pins-v2", on);
  store.set("gv-pins", on);
  $("#pinToggle")?.classList.toggle("active", on);
  $("#pinToggle")?.setAttribute("aria-pressed", String(on));
  refreshHtmlLayer();
}

/* ── Compare: glowing great-circle arc + floating distance badge ── */
const ARC_SCALE = 0.42;

function buildArcBadge(a) {
  const div = document.createElement("div");
  div.className = "arc-badge";
  div.textContent = `📏 ${fmtFull.format(a.km)} km`;
  return div;
}

function buildLifeHolo(w) {
  const div = document.createElement("div");
  div.className = "life-holo";
  const src = `https://sketchfab.com/models/${w.model.uid}/embed?autospin=0.35&autostart=1&preload=1&ui_theme=dark&ui_infos=0&ui_hint=0&ui_watermark=0&ui_controls=0&ui_stop=0&transparent=1`;
  div.innerHTML = `
    <div class="holo-head">
      <span class="holo-title">${w.sp.e} ${w.sp.n}</span>
      <button class="holo-close" title="Dismiss">✕</button>
    </div>
    <iframe class="holo-frame" title="${w.sp.n} 3D" src="${src}"
      allow="autoplay; fullscreen; xr-spatial-tracking" allowfullscreen></iframe>
    ${modelCredit(w.model)}
    <div class="holo-beam"></div>`;
  div.querySelector(".holo-close").setAttribute("aria-label", `Dismiss the ${w.sp.n} 3D model`);
  div.querySelector(".holo-close").onclick = (e) => { e.stopPropagation(); clearLifePin(); };
  div.addEventListener("pointerdown", (e) => e.stopPropagation()); // don't spin the globe from the card
  return anchorWrap(div);
}

// Painted pins (wonders, tiny nations), the few rich HTML cards, and the name labels
function refreshHtmlLayer() {
  if (!S.globe) return;
  const pins = [];
  if (S.mode === "earth" && S.earthLayers.wonders) pins.push(...WONDERS);
  if (microActive()) pins.push(...S.micro);
  S.globe.markersData(pins);
  S.globe.htmlElementsData([S.compare?.badge, S.lifePin].filter(Boolean));
  refreshLabels();
}

function countryLabels() {
  return uniqueCountries().map((f) => {
    const [lat, lng] = f.gv.latlng?.length === 2 ? f.gv.latlng : [centroidOf(f).lat, centroidOf(f).lng];
    // bigger countries get bigger names and show from further away
    return { f, lat, lng, text: nameOf(f), size: clamp(0.45 + Math.log10(f.gv.area || 1) * 0.22, 0.5, 1.9), color: "#1f2f42" };
  });
}

// Country names on the globe (new engine): explore & atlas — never in quizzes, they'd give answers away
function refreshLabels() {
  if (!S.globe || S.mode === "earth") return; // Earth mode shows physical-feature labels instead
  if (S.stateView) {
    const sv = S.stateView;
    sv.labels ??= sv.adm1.map((st) => {
      const [lng, lat] = d3.geoCentroid(st);
      // size from area, so big states name themselves first and small ones appear as you zoom in
      return { st, lat, lng, text: st.properties.shapeName || st.properties.name || "", size: clamp(0.55 + Math.log10(d3.geoArea(st) * 4.06e7 + 1) * 0.2, 0.5, 1.7), color: "#3a2a12" };
    });
    S.globe.labelsData(S.names ? sv.labels : []);
    return;
  }
  const show = S.names && S.mode !== "quiz" && !S.activeTour;
  S.globe.labelsData(show ? (S.countryLabels ??= countryLabels()) : []);
}

function setMapStyle(style) {
  S.mapStyle = style === "terrain" ? "terrain" : "political";
  store.set("gv-map", S.mapStyle);
  const on = S.mapStyle === "terrain";
  $("#styleToggle")?.classList.toggle("active", on);
  $("#styleToggle")?.setAttribute("aria-pressed", String(on));
  $("#styleToggle")?.setAttribute("aria-label", on ? "Show the political map" : "Show the terrain view");
  refreshPolys();
}

// Soft UI sounds, synthesised on the fly (no audio files) — off unless switched on
const sfx = (() => {
  let ac = null;
  const tone = (freq, at, dur, type = "sine", gain = 0.07) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(ac.destination);
    o.start(at); o.stop(at + dur + 0.02);
  };
  const SOUNDS = {
    select: (t) => tone(620, t, 0.14),
    correct: (t) => { tone(660, t, 0.12); tone(990, t + 0.09, 0.18); },
    wrong: (t) => tone(190, t, 0.24, "triangle", 0.06),
    skipped: (t) => tone(330, t, 0.12, "sine", 0.05),
    click: (t) => tone(880, t, 0.06, "sine", 0.04),
  };
  return (kind) => {
    if (!S.sound || !SOUNDS[kind]) return;
    try {
      ac ??= new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === "suspended") ac.resume();
      SOUNDS[kind](ac.currentTime + 0.005);
    } catch (e) { /* audio unavailable — stay silent */ }
  };
})();

function setSound(on, quiet = false) {
  S.sound = on;
  store.set("gv-sound", on);
  $("#soundToggle")?.classList.toggle("active", on);
  $("#soundToggle")?.setAttribute("aria-pressed", String(on));
  $("#soundToggle")?.setAttribute("aria-label", on ? "Turn sounds off" : "Turn sounds on");
  if (!quiet) sfx("click");
}

// The bottom hint says its piece, then gets out of the way; it returns briefly when its text changes
function initHint() {
  const h = $("#hudHint");
  if (!h) return;
  let t;
  const fadeIn = (ms) => { clearTimeout(t); t = setTimeout(() => h.classList.add("faded"), ms); };
  new MutationObserver(() => { h.classList.remove("faded"); fadeIn(6000); })
    .observe(h, { childList: true, characterData: true, subtree: true });
  $("#globeViz").addEventListener("pointerdown", () => fadeIn(1500), { passive: true });
  fadeIn(8000);
}

function setNames(on) {
  S.names = on;
  store.set("gv-names", on);
  $("#namesToggle")?.classList.toggle("active", on);
  $("#namesToggle")?.setAttribute("aria-pressed", String(on));
  refreshLabels();
}

function clearLifePin() {
  if (!S.lifePin) return;
  S.lifePin = null;
  refreshHtmlLayer();
}

// Drop the species' interactive 3D model onto the globe at the country's location and dive to it.
async function placeLifeOnGlobe(sp, countryD, btn) {
  const label = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Summoning…"; }
  try {
    const model = await sketchfabBest(sp);
    if (!model) throw new Error("no model");

    const { lat, lng } = centroidOf(countryD);
    S.lifePin = { __kind: "life", lat, lng, sp, model };
    refreshHtmlLayer();
    ringPulse(lat, lng, 3, "126,224,255");

    const panelSheet = sheets.get($("#panel"));
    if (isMobile() && panelVisible() && panelSheet?.state !== "peek") {
      setSheet($("#panel"), "peek"); // frees most of the screen; the snap re-frames the country
    } else {
      const alt = Math.min(1.6, Math.max(0.85, viewAltitudeFor(countryD)));
      S.globe.pointOfView(viewFor(lat, lng, alt * stageZoom()), 1300);
      pauseRotate();
    }
    toast(`${sp.e} ${sp.n} is standing on ${nameOf(countryD)} — drag inside the card to inspect it`);
  } catch (e) {
    toast(`⚠️ No 3D model found for ${sp.n}`);
  }
  if (btn) { btn.disabled = false; btn.textContent = label; }
}

// Sketchfab categories keep the search on-species (relevance alone can pick a "Tiger" tank).
const SF_CATEGORY = { plant: "nature-plants" }; // fauna → animals-pets (default below)

// Skeletons, skulls, fossils & museum specimens — reject these; we want the living creature.
const SF_REJECT = /skeleton|skull|\bbones?\b|fossil|specimen|cranium|dentary|\bjaw\b|\btooth\b|\bteeth\b|vertebra|anatom|ecorch|écorch|taxiderm|\bdead\b|carcass|\bmount(ed)?\b|dissect|[A-Z]{2,}:\s?[A-Z]{2,}|:\d{4,}/i;

// One category-scoped search, returning relevant candidates only.
async function sketchfabSearch(query, category) {
  const url = `https://api.sketchfab.com/v3/search?type=models&q=${encodeURIComponent(query)}` +
    (category ? `&categories=${category}` : "") + `&count=18`;
  const j = await fetch(url).then((r) => r.json());
  return j?.results || [];
}

// Best 3D model for a species: in-category & relevant, drop skeletons/specimens, then prefer most-liked.
// → { uid, name, author, authorUrl, license, url } — credits travel with the model (many are CC BY)
const modelCache = new Map();
async function sketchfabBest(sp) {
  if (modelCache.has(sp.n)) return modelCache.get(sp.n);
  const category = SF_CATEGORY[sp.t] || "animals-pets";
  const lastWord = sp.n.split(" ").slice(-1)[0];
  const pickBest = (results) => {
    const live = results.filter((m) => !SF_REJECT.test(m.name || ""));
    const pool = live.length ? live : results; // if everything looks anatomical, take what we have
    pool.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
    const m = pool[0];
    return m?.uid ? {
      uid: m.uid, name: m.name || sp.n,
      author: m.user?.displayName || m.user?.username || "a Sketchfab artist",
      authorUrl: m.user?.profileUrl || "https://sketchfab.com",
      license: m.license?.label || "",
      url: m.viewerUrl || `https://sketchfab.com/3d-models/${m.uid}`,
    } : null;
  };
  // 1) full name in-category  2) key word in-category  3) full name, any category
  for (const [q, cat] of [[sp.n, category], [lastWord, category], [sp.n, ""]]) {
    const model = pickBest(await sketchfabSearch(q, cat));
    if (model) { modelCache.set(sp.n, model); return model; }
  }
  return null;
}

// "Tiger" by Jungle Jim · CC Attribution · Sketchfab — shown under every embedded model
function modelCredit(m) {
  return `<div class="model-credit">“<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.name)}</a>” by
    <a href="${esc(m.authorUrl)}" target="_blank" rel="noopener">${esc(m.author)}</a>${m.license ? ` · ${esc(m.license)}` : ""} · Sketchfab</div>`;
}

function renderWildlife(d, body, token) {
  const country = nameOf(d);
  const species = wildlifeFor(d);
  const scope = d.gv && WILDLIFE_BY_CCA3[d.gv.cca3]?.length
    ? country
    : (d.gv?.subregion || d.gv?.region || "this region");
  body.innerHTML = `
    <p style="font-size:13px;color:var(--text-dim);line-height:1.55;margin-bottom:14px">
      Iconic wildlife &amp; flora of <b style="color:var(--gold)">${scope}</b>. Tap a species to read about it — then spin its <b>interactive 3D model</b>.</p>
    <div class="life-grid">
      ${species.map((s, i) => `
        <div class="life-card" data-i="${i}">
          <div class="life-head">
            <span class="life-emoji">${s.e}</span>
            <div class="life-meta"><div class="life-name">${s.n}</div><div class="life-type">${TYPE_LABEL[s.t] || s.t}</div></div>
            <span class="life-caret">▾</span>
          </div>
          <div class="life-detail"></div>
        </div>`).join("")}
    </div>`;

  $$("#panelBody .life-card").forEach((card) => {
    const head = card.querySelector(".life-head");
    head.addEventListener("click", () => {
      const open = card.classList.toggle("open");
      if (open && !card.dataset.loaded) {
        card.dataset.loaded = "1";
        loadLifeDetail(card, species[+card.dataset.i], country);
      }
    });
  });
}

async function loadLifeDetail(card, sp, country) {
  const box = card.querySelector(".life-detail");
  box.innerHTML = `<div class="loading-dots" style="padding:10px 0">Consulting field guide for ${sp.n}</div>`;
  const wiki = await fetchWikiFirst([sp.n, `${sp.n} (${sp.t})`, `${sp.n} (animal)`, `${sp.n} (plant)`]);
  const firstSentence = wiki?.extract ? wiki.extract.split(/(?<=[.!?])\s+/)[0] : "";
  const remainingText = wiki?.extract && firstSentence ? wiki.extract.slice(firstSentence.length).trim() : (wiki?.extract || "Native species of this biogeographic realm.");

  const taxon = TYPE_LABEL[sp.t] || sp.t || "Fauna";
  const conservationStatus = (sp.n.includes("Tiger") || sp.n.includes("Panda") || sp.n.includes("Rhino") || sp.n.includes("Gorilla") || sp.n.includes("Leopard"))
    ? "IUCN: Endangered"
    : (sp.n.includes("Bear") || sp.n.includes("Elephant") || sp.n.includes("Lion") || sp.n.includes("Cheetah") ? "IUCN: Vulnerable" : "IUCN: Protected");

  const biomeType = (sp.t === "marine" || sp.n.includes("Whale") || sp.n.includes("Shark") || sp.n.includes("Seal"))
    ? "Marine & Coastal"
    : (sp.n.includes("Camel") ? "Arid Deserts & Steppe"
    : (sp.n.includes("Penguin") || sp.n.includes("Bear") ? "Polar & Glacial Ice"
    : (sp.n.includes("Jaguar") || sp.n.includes("Monkey") ? "Equatorial Rainforest" : "Temperate & Montane")));

  box.innerHTML = `
    <div class="field-badge emerald">WILDLIFE FIELD NOTES · ${esc(taxon.toUpperCase())}</div>
    ${wiki?.thumb ? `
      <div class="story-photo-banner" style="height:150px;margin-bottom:10px">
        <img src="${wiki.thumb}" alt="${sp.n}" loading="lazy" />
        <div class="story-photo-credit">Wikimedia Commons</div>
      </div>` : ""}
    
    <div class="telemetry-strip" style="margin-bottom:12px">
      <div class="telemetry-item">
        <span class="ti-label">Classification</span>
        <span class="ti-val emerald">${esc(taxon)}</span>
      </div>
      <div class="telemetry-item">
        <span class="ti-label">Conservation</span>
        <span class="ti-val amber">${conservationStatus}</span>
      </div>
      <div class="telemetry-item">
        <span class="ti-label">Native Biome</span>
        <span class="ti-val accent">${biomeType}</span>
      </div>
    </div>

    ${firstSentence ? `
      <div class="story-spark-box" style="margin-bottom:10px">
        <div class="spark-icon">✨</div>
        <div class="spark-text">${firstSentence}</div>
      </div>` : ""}
    <div class="story-explain-box" style="margin-bottom:10px">
      <div class="seb-label">Adaptation to Terrain & Climate</div>
      <p class="seb-text">${remainingText}</p>
    </div>
    <div class="life-actions">
      <button class="life-globe-btn">🌍 See on 3D Globe</button>
      <button class="life-3d-btn">🧊 Interactive 3D Model</button>
      ${wiki?.url ? `<a class="wiki-source" href="${wiki.url}" target="_blank" rel="noopener">Encyclopedia Archive →</a>` : ""}
    </div>
    <div class="life-viewer"></div>`;
  card.querySelector(".life-globe-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    if (S.selected) placeLifeOnGlobe(sp, S.selected, e.currentTarget);
  });
  card.querySelector(".life-3d-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    loadLife3D(card, sp);
  });
}

async function loadLife3D(card, sp) {
  const mount = card.querySelector(".life-viewer");
  const btn = card.querySelector(".life-3d-btn");
  if (card.dataset.model3d) { // toggle off
    mount.innerHTML = ""; card.dataset.model3d = "";
    btn.textContent = "🧊 View in 3D"; return;
  }
  btn.textContent = "⏳ Loading model…"; btn.disabled = true;
  mount.innerHTML = `<div class="loading-dots" style="padding:10px 0">Sculpting a 3D ${sp.n}</div>`;
  try {
    const model = await sketchfabBest(sp);
    if (!model) throw new Error("no model");
    const src = `https://sketchfab.com/models/${model.uid}/embed?autospin=0.4&autostart=1&ui_theme=dark&ui_infos=0&ui_hint=0&ui_watermark=0&transparent=1`;
    mount.innerHTML = `<iframe class="life-iframe" title="${sp.n} 3D model" src="${src}"
        allow="autoplay; fullscreen; xr-spatial-tracking" allowfullscreen mozallowfullscreen="true" webkitallowfullscreen="true"></iframe>
      <div class="life-3d-hint">Drag to rotate · scroll/pinch to zoom</div>
      ${modelCredit(model)}`;
    card.dataset.model3d = "1";
    btn.textContent = "✕ Hide 3D model";
  } catch (e) {
    mount.innerHTML = `<p class="life-text" style="color:var(--text-dim)">No 3D model found for ${sp.n} — try another species.</p>`;
    btn.textContent = "🧊 View in 3D";
  }
  btn.disabled = false;
}

/* ───────────────────────── COMPARE ───────────────────────── */
function startComparePick() {
  if (!S.selected?.gv) return;
  S.comparePick = true;
  ++S.panelToken;
  showPanelTabs(false);
  const a = S.selected;
  const neighbours = (a.gv.borders || []).map((b) => S.byCca3.get(b)).filter(Boolean).slice(0, 6);
  const giants = uniqueCountries().filter((f) => f !== a && !neighbours.includes(f))
    .sort((x, y) => (y.gv.population || 0) - (x.gv.population || 0)).slice(0, 6);
  $("#panelBody").innerHTML = `
    <div class="cmp-pick">
      <div class="cmp-pick-title">⚖️ Compare ${flagEmoji(a.gv.cca2)} ${esc(nameOf(a))} with…</div>
      <p class="cmp-pick-sub">${isCoarse() ? "Tap" : "Click"} any country on the globe, or search:</p>
      <input id="cmpInput" class="cmp-input" type="text" placeholder="Type a country…" autocomplete="off" spellcheck="false" aria-label="Country to compare with" />
      <div id="cmpSuggest" class="pill-row"></div>
      <button id="cmpCancel" class="cmp-cancel">Cancel</button>
    </div>`;
  const chip = (f) => `<button class="pill click" data-cca3="${f.gv.cca3}">${flagEmoji(f.gv.cca2)} ${esc(nameOf(f))}</button>`;
  const showDefault = () => { $("#cmpSuggest").innerHTML = [...neighbours, ...giants].map(chip).join(""); wire(); };
  const wire = () => $$("#cmpSuggest .pill").forEach((p) => p.addEventListener("click", () => pickCompare(S.byCca3.get(p.dataset.cca3))));
  showDefault();
  $("#cmpInput").addEventListener("input", (e) => {
    const q = normalize(e.target.value);
    if (!q) return showDefault();
    const hits = searchItems(q, (it) => it.kind === "country" && it.f !== a, 8);
    $("#cmpSuggest").innerHTML = hits.length ? hits.map((it) => chip(it.f)).join("") : `<span class="cmp-none">No match</span>`;
    wire();
  });
  $("#cmpInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#cmpSuggest .pill")?.click();
  });
  $("#cmpCancel").addEventListener("click", () => { clearCompare(); openPanel(a); });
  if (!isCoarse()) $("#cmpInput").focus();
  refreshPolys(); // compare-flavoured tooltips
}

function pickCompare(d) {
  if (!d?.gv) { toast("Pick a country with data to compare"); return; }
  if (d === S.selected) { toast("Pick a different country to compare with"); return; }
  setCompare(S.selected, d);
}

function setCompare(a, b) {
  S.comparePick = false;
  const ca = centroidOf(a), cb = centroidOf(b);
  const km = Math.round(haversine(ca, cb));
  const ang = d3.geoDistance([ca.lng, ca.lat], [cb.lng, cb.lat]); // radians
  const [mLng, mLat] = d3.geoInterpolate([ca.lng, ca.lat], [cb.lng, cb.lat])(0.5);
  // three-globe arcs peak at ≈ 1.125 × scale × distance/2 — float the badge at the apex
  const badge = { __kind: "arc", lat: mLat, lng: mLng, alt: 1.125 * ARC_SCALE * (ang / 2) + 0.01, km };
  S.compare = { a, b, km, badge, mid: { lat: mLat, lng: mLng }, ang };
  const arc = { sLat: ca.lat, sLng: ca.lng, eLat: cb.lat, eLng: cb.lng, km };
  S.globe.arcsData([{ ...arc, glow: true }, arc]);
  ringPulse([ca, cb], 3, "126,224,255");
  refreshHtmlLayer();
  refreshPolys();

  if (isMobile()) setSheet($("#panel"), "half", false);
  renderCompare();
  frameCompare(1400);
  scheduleUrl();

  if (Object.keys(WB_EXTRA).some((k) => !S.wb[k])) {
    Promise.all(Object.keys(WB_EXTRA).map(ensureIndicator)).then(() => { if (S.compare?.b === b) renderCompare(); });
  }
}

// Fit both countries (and the arc between them) into the visible stage
function frameCompare(ms = 1000) {
  if (!S.compare) return;
  const { mid, ang } = S.compare;
  const alt = clamp((ang * 180) / Math.PI / 38 + 0.55, 0.8, 3.0) * stageZoom();
  S.globe.pointOfView(viewFor(mid.lat, mid.lng, alt), ms);
  pauseRotate();
}

const CMP_ROWS = [
  ["👥 Population", (c) => c.population, (v) => fmt.format(v)],
  ["📐 Area", (c) => c.area, (v) => fmt.format(v) + " km²"],
  ["🏙️ Density", (c) => (c.area && c.population != null ? c.population / c.area : null), (v) => fmt.format(v) + " /km²"],
  ["💰 GDP", (c) => ATLAS_SCALES.gdp.get(c), (v) => "$" + fmt.format(v)],
  ["💎 GDP per capita", (c) => ATLAS_SCALES.gdppc.get(c), (v) => "$" + fmt.format(v)],
  ["❤️ Life expectancy", (c) => ATLAS_SCALES.life.get(c), (v) => v.toFixed(1) + " yrs"],
  ["🤝 Land neighbours", (c) => (c.borders || []).length, (v) => String(v)],
  ["🗣️ Official languages", (c) => Object.keys(c.languages || {}).length, (v) => String(v)],
];

function renderCompare() {
  if (!S.compare) return;
  ++S.panelToken;
  const { a, b, km } = S.compare;
  const A = a.gv, B = b.gv;
  showPanelTabs(false);
  $("#panelHeader").style.setProperty("--flagbg", A.flags?.svg ? `url('${A.flags.svg}')` : "none");
  setPanelFlag(A.flags?.svg, nameOf(a));
  $("#panelName").textContent = `${flagEmoji(A.cca2)} ${nameOf(a)} vs ${flagEmoji(B.cca2)} ${nameOf(b)}`;
  $("#panelOfficial").textContent = "Head-to-head";

  const rows = CMP_ROWS.map(([label, get, show]) => {
    const va = get(A), vb = get(B);
    if (va == null && vb == null) return "";
    const max = Math.max(va || 0, vb || 0) || 1;
    const win = va == null || vb == null || va === vb ? "" : va > vb ? "a" : "b";
    return `
      <div class="cmp-row">
        <div class="cmp-label">${label}</div>
        <div class="cmp-duel">
          <span class="cmp-val a${win === "a" ? " win" : ""}">${va != null ? show(va) : "—"}</span>
          <span class="cmp-bar a"><i style="width:${((va || 0) / max) * 100}%"></i></span>
          <span class="cmp-bar b"><i style="width:${((vb || 0) / max) * 100}%"></i></span>
          <span class="cmp-val b${win === "b" ? " win" : ""}">${vb != null ? show(vb) : "—"}</span>
        </div>
      </div>`;
  }).join("");

  $("#panelBody").innerHTML = `
    <div class="cmp-head">
      <div class="cmp-side"><img src="${A.flags?.svg || ""}" alt="Flag of ${esc(nameOf(a))}" /><b>${esc(nameOf(a))}</b><span>${esc(A.capital?.[0] || "—")}</span></div>
      <div class="cmp-vs">VS<small>📏 ${fmtFull.format(km)} km</small></div>
      <div class="cmp-side"><img src="${B.flags?.svg || ""}" alt="Flag of ${esc(nameOf(b))}" /><b>${esc(nameOf(b))}</b><span>${esc(B.capital?.[0] || "—")}</span></div>
    </div>
    <div class="cmp-rows">${rows}</div>
    <div class="cmp-meta">${esc(A.region)}${A.subregion ? " · " + esc(A.subregion) : ""} &nbsp;⟷&nbsp; ${esc(B.region)}${B.subregion ? " · " + esc(B.subregion) : ""}</div>
    <div class="cmp-actions">
      <button id="cmpSwap">⇄ Swap</button>
      <button id="cmpOpenB">Open ${flagEmoji(B.cca2)} ${esc(nameOf(b))}</button>
      <button id="cmpEnd" class="quit">✕ End compare</button>
    </div>`;
  $("#cmpSwap").addEventListener("click", () => { S.selected = b; setCompare(b, a); });
  $("#cmpOpenB").addEventListener("click", () => selectCountry(b));
  $("#cmpEnd").addEventListener("click", () => endCompare());
}

// Leave compare mode and go back to country A's drawer
function endCompare() {
  const a = S.compare?.a || S.selected;
  clearCompare();
  if (a && panelVisible()) { S.selected = a; openPanel(a); frameCountry(a); }
  scheduleUrl();
}

// Tear down compare visuals without touching the drawer
function clearCompare() {
  if (!S.compare && !S.comparePick) return;
  S.compare = null;
  S.comparePick = false;
  S.globe.arcsData([]);
  refreshHtmlLayer();
  refreshPolys();
}

/* ───────────────────────── SEARCH (⌘K command palette) ───────────────────────── */
const normalize = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// 0 = no match. Exact > prefix > word-prefix > substring > in-order fuzzy (typo-tolerant-ish).
function fuzzyScore(q, s) {
  if (!q || !s) return 0;
  if (s === q) return 100;
  if (s.startsWith(q)) return 85 - Math.min(15, (s.length - q.length) * 0.4);
  if (s.includes(" " + q)) return 68;
  const i = s.indexOf(q);
  if (i >= 0) return 52 - Math.min(10, i);
  const qq = q.replace(/ /g, "");
  if (qq.length < 3) return 0;
  // one typo in the first letters ("kenia" → Kenya, "brasil" → Brazil)
  if (q.length >= 4 && editDistance(q, s.slice(0, q.length)) <= 1) return 40;
  let from = 0, gaps = 0, last = -1, first = -1;
  for (const ch of qq) {
    const k = s.indexOf(ch, from);
    if (k < 0) return 0;
    if (first < 0) first = k;
    if (last >= 0) gaps += k - last - 1;
    last = k;
    from = k + 1;
  }
  const sc = 34 - gaps * 1.6 - first * 0.6;
  return sc > 4 ? sc : 0;
}

// Levenshtein distance (short strings only)
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function buildSearchIndex() {
  const items = [];
  for (const f of uniqueCountries()) {
    const c = f.gv;
    items.push({
      kind: "country", label: nameOf(f), sub: c.capital?.[0] ? `Capital: ${c.capital[0]}` : c.region,
      icon: flagEmoji(c.cca2), f, weight: 3 + Math.log10((c.population || 1e4) + 1) / 3,
      keys: [nameOf(f), c.name?.official, ...(c.altSpellings || []).filter((x) => x.length > 3), c.cca3],
    });
    for (const cap of c.capital || []) {
      items.push({ kind: "capital", label: cap, sub: `Capital of ${nameOf(f)}`, icon: "🏛️", f, weight: 2.2, keys: [cap] });
    }
  }
  for (const w of WONDERS) {
    items.push({ kind: "wonder", label: w.name, sub: w.kind, icon: w.emoji, weight: 2.5, keys: [w.name],
      l: { text: w.name, kind: w.kind, emoji: w.emoji, lat: w.lat, lng: w.lng } });
  }
  if (S.earth) {
    const seen = new Set(WONDERS.map((w) => normalize(w.name)));
    for (const l of [...S.earth.marineLabels, ...S.earth.regionLabels, ...S.earth.lakeLabels]) {
      const n = normalize(l.text);
      if (seen.has(n)) continue;
      seen.add(n);
      items.push({ kind: "feature", label: titleCase(l.text), sub: l.kind, icon: l.emoji, weight: l.kind === "ocean" ? 2.6 : 1.6, keys: [l.text], l });
    }
    for (const name of new Set(S.earth.riverPaths.map((p) => p.name))) {
      if (seen.has(normalize(name))) continue;
      items.push({ kind: "river", label: name, sub: "river", icon: "💧", weight: 1.5, keys: [name], l: { text: name, kind: "river", emoji: "💧" } });
    }
  }
  if (typeof STORY_TOURS !== "undefined") {
    for (const t of STORY_TOURS) {
      items.push({
        kind: "tour", label: t.title, sub: `5-stop tour · ${t.subtitle}`, icon: t.icon, weight: 3.5,
        keys: [t.title, t.subtitle, "story", "tour", "expedition"],
        tourId: t.id
      });
    }
  }
  for (const it of items) it.norm = it.keys.filter(Boolean).map(normalize);
  return items;
}

function searchItems(q, filter = () => true, limit = 9) {
  S.searchIndex ??= buildSearchIndex();
  const out = [];
  for (const it of S.searchIndex) {
    if (!filter(it)) continue;
    let best = 0;
    for (const k of it.norm) { const s = fuzzyScore(q, k); if (s > best) best = s; }
    if (best) out.push([best + it.weight * 3, it]);
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, it]) => it);
}

const KIND_TAG = { country: "Country", capital: "Capital", wonder: "Wonder", feature: "Physical", river: "River", tour: "Story Tour" };

function openPalette() {
  const pal = $("#palette");
  if (!pal.classList.contains("hidden")) return $("#searchInput").focus();
  closeProgressPop();
  pal.classList.remove("hidden");
  $("#searchInput").value = "";
  renderPalette("");
  setTimeout(() => $("#searchInput").focus(), 0);
  // oceans, seas, ranges and rivers become searchable once the physical layers are in
  if (!S.earth && !navigator.connection?.saveData) {
    $("#paletteFoot").textContent = "Loading oceans, ranges & rivers…";
    loadEarthData().then(() => {
      $("#paletteFoot").textContent = "↑↓ to move · Enter to fly · Esc to close";
      if (!pal.classList.contains("hidden")) renderPalette($("#searchInput").value);
    }).catch(() => { $("#paletteFoot").textContent = "↑↓ to move · Enter to fly · Esc to close"; });
  }
}

function closePalette() {
  $("#palette").classList.add("hidden");
  $("#searchInput").blur();
}

let paletteHits = [], paletteSel = 0;

function renderPalette(raw) {
  const q = normalize(raw);
  const box = $("#searchResults");
  if (!q) {
    S.searchIndex ??= buildSearchIndex();
    const unexplored = uniqueCountries().filter((f) => !S.visited.has(f.gv.cca3))
      .sort((a, b) => (b.gv.population || 0) - (a.gv.population || 0)).slice(0, 4);
    paletteHits = unexplored.map((f) => S.searchIndex.find((it) => it.kind === "country" && it.f === f)).filter(Boolean);
    box.innerHTML = `<div class="pal-empty">Try “Kenya”, “Lima”, “Everest”, “Sahara” or “Mekong” — or explore these:</div>`;
  } else {
    paletteHits = searchItems(q);
    box.innerHTML = paletteHits.length ? "" : `<div class="pal-empty">No places match “${esc(raw)}”.</div>`;
  }
  paletteSel = 0;
  box.insertAdjacentHTML("beforeend", paletteHits.map((it, i) => `
    <div class="search-item${i === 0 ? " hl" : ""}" role="option" id="pal-opt-${i}" aria-selected="${i === 0}" data-i="${i}">
      <span class="si-flag">${it.icon || "📍"}</span>
      <span class="si-main"><span class="si-name">${esc(it.label)}</span><span class="si-sub">${esc(it.sub || "")}</span></span>
      <span class="si-tag">${KIND_TAG[it.kind]}</span>
    </div>`).join(""));
  $("#searchInput").setAttribute("aria-activedescendant", paletteHits.length ? "pal-opt-0" : "");
  box.querySelectorAll(".search-item").forEach((el) => {
    el.addEventListener("click", () => pickSearch(paletteHits[+el.dataset.i]));
    el.addEventListener("pointermove", () => highlightPalette(+el.dataset.i));
  });
}

function highlightPalette(i) {
  paletteSel = (i + paletteHits.length) % Math.max(1, paletteHits.length);
  $$("#searchResults .search-item").forEach((el, k) => {
    el.classList.toggle("hl", k === paletteSel);
    el.setAttribute("aria-selected", String(k === paletteSel));
  });
  $(`#pal-opt-${paletteSel}`)?.scrollIntoView({ block: "nearest" });
  $("#searchInput").setAttribute("aria-activedescendant", `pal-opt-${paletteSel}`);
}

async function pickSearch(it) {
  if (!it) return;
  closePalette();
  exitStateView(false);
  if (it.kind === "tour") {
    startStoryTour(it.tourId);
    return;
  }
  if (it.kind === "country" || it.kind === "capital") {
    selectCountry(it.f);
    if (it.kind === "capital") toast(`🏛️ ${it.label} is the capital of ${nameOf(it.f)}`);
    return;
  }
  let l = it.l;
  if (it.kind === "river") l = await findPhysical(it.label);
  openPhysical(l);
}

function initSearch() {
  const input = $("#searchInput");
  $("#searchKbd").textContent = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K";
  $("#searchTrigger").addEventListener("click", openPalette);
  $("#paletteClose").addEventListener("click", closePalette);
  $("#palette").addEventListener("click", (e) => { if (e.target.id === "palette") closePalette(); });
  input.addEventListener("input", () => renderPalette(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); highlightPalette(paletteSel + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlightPalette(paletteSel - 1); }
    else if (e.key === "Enter") { e.preventDefault(); pickSearch(paletteHits[paletteSel]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closePalette(); }
  });
}

/* ───────────────────────── QUIZ ───────────────────────── */
const ROUNDS = 10;

// Mulberry32: tiny seeded PRNG → everyone opening the same challenge link gets the same 10 questions.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWith(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Challenge codes: TYPE-ARENA-DIFFICULTY-SEED, e.g. FL-EU-H-07K3X9
const TYPE_CODE = { find: "FC", capital: "CA", flag: "FL", city: "CI", borders: "NB", duel: "BS", wonder: "WH" };
const REGION_CODE = { World: "WD", Africa: "AF", Americas: "AM", Asia: "AS", Europe: "EU", Oceania: "OC" };
const invertMap = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
const CODE_TYPE = invertMap(TYPE_CODE), CODE_REGION = invertMap(REGION_CODE);

function encodeChallenge({ type, region, diff, seed }) {
  return `${TYPE_CODE[type]}-${REGION_CODE[region]}-${diff}-${(seed >>> 0).toString(36).toUpperCase().padStart(6, "0")}`;
}

function decodeChallenge(code) {
  const m = /^([A-Z]{2})-([A-Z]{2})-([ENH])-([0-9A-Z]{1,7})$/.exec(String(code || "").trim().toUpperCase());
  if (!m || !CODE_TYPE[m[1]] || !CODE_REGION[m[2]]) return null;
  const seed = parseInt(m[4], 36);
  if (!Number.isFinite(seed) || seed > 0xffffffff) return null;
  return { type: CODE_TYPE[m[1]], region: CODE_REGION[m[2]], diff: m[3], seed };
}

const DIFF_RULES = {
  E: { minPop: [8e6, 2e6, 1e5, 0], attempts: 3, wonderKm: 1000 }, // household names only
  N: { minPop: [1e5, 0], attempts: 3, wonderKm: 700 },
  H: { minPop: [0], attempts: 2, wonderKm: 400 },                  // every territory, fewer tries
};

const QUIZ_HINTS = {
  find: "Click the country on the globe!",
  wonder: "Click the spot on the globe!",
  mystery: "Spin the globe and click the mystery country!",
  chain: "Guess if the next country has MORE or FEWER/SMALLER!",
  pinpoint: "Click/tap the target location on the 3D globe!",
  blitz: "Choose the correct answer!",
};

const PINPOINT_TARGETS = [
  { name: "Mount Everest", sub: "Himalayas, Nepal / China", lat: 27.988, lng: 86.925, hint: "Tallest mountain on Earth (8,848 m) between Nepal and Tibet", fact: "Marine limestone at Everest's summit was once an ancient ocean floor." },
  { name: "Tokyo", sub: "Japan", lat: 35.676, lng: 139.650, hint: "World's most populous metropolitan area on the island of Honshu", fact: "Over 37 million people live in greater Tokyo—more than the entire population of Canada." },
  { name: "Great Barrier Reef", sub: "Coral Sea, Australia", lat: -18.286, lng: 147.700, hint: "World's largest coral reef system off Queensland's coast", fact: "The only living structure visible from space, stretching over 2,300 km." },
  { name: "Taj Mahal", sub: "Agra, India", lat: 27.175, lng: 78.042, hint: "Ivory-white marble mausoleum on the right bank of Yamuna river", fact: "Built by Emperor Shah Jahan in 1632, requiring over 20,000 artisans." },
  { name: "Grand Canyon", sub: "Arizona, United States", lat: 36.107, lng: -112.113, hint: "Immense canyon carved by the Colorado River in the American Southwest", fact: "Exposes nearly two billion years of Earth's geological history in its layered rock walls." },
  { name: "Eiffel Tower", sub: "Paris, France", lat: 48.858, lng: 2.294, hint: "Wrought-iron lattice tower on the Champ de Mars along the Seine River", fact: "During summer heat, thermal expansion makes the tower grow up to 15 cm taller." },
  { name: "Victoria Falls", sub: "Zambia / Zimbabwe", lat: -17.924, lng: 25.856, hint: "Spectacular curtain of falling water on the Zambezi River", fact: "Locally named 'The Smoke That Thunders', it forms the largest sheet of falling water on Earth." },
  { name: "Pyramids of Giza", sub: "Cairo, Egypt", lat: 29.979, lng: 31.134, hint: "Ancient stone pyramids on the Giza plateau bordering the Sahara", fact: "The Great Pyramid remained the tallest man-made structure on Earth for over 3,800 years." },
  { name: "Machu Picchu", sub: "Cusco Region, Peru", lat: -13.163, lng: -72.545, hint: "15th-century Inca citadel perched on an Andean mountain ridge at 2,430 m", fact: "Inca stonemasons fitted giant granite blocks without mortar so closely that a knife blade cannot slide between them." },
  { name: "Sydney Opera House", sub: "New South Wales, Australia", lat: -33.856, lng: 151.215, hint: "Multi-venue performing arts centre in Sydney Harbour with sail-shaped roof shells", fact: "Its iconic vaulted shells are tiled with over 1 million ceramic Swedish tiles." },
  { name: "Amazon River Mouth", sub: "Amapá / Pará, Brazil", lat: 0.1, lng: -49.5, hint: "Where the world's most voluminous river empties into the Atlantic Ocean", fact: "Discharges so much freshwater that ocean salinity is diluted 100 miles offshore." },
  { name: "Cape of Good Hope", sub: "South Africa", lat: -34.357, lng: 18.473, hint: "Rocky promontory on the Atlantic coast of the Cape Peninsula", fact: "Originally named 'Cape of Storms' by Portuguese explorer Bartolomeu Dias in 1488." },
  { name: "Galápagos Islands", sub: "Pacific Ocean, Ecuador", lat: -0.777, lng: -91.142, hint: "Volcanic archipelago on the equator famed for fearless endemic wildlife", fact: "Inspired Charles Darwin's theory of evolution by natural selection after his 1835 voyage on the Beagle." },
  { name: "Mount Kilimanjaro", sub: "Tanzania", lat: -3.076, lng: 37.353, hint: "Dormant stratovolcano and the highest peak in Africa (5,895 m)", fact: "It is the tallest free-standing mountain rise above sea level in the world." },
  { name: "Petra", sub: "Ma'an Governorate, Jordan", lat: 30.328, lng: 35.444, hint: "Ancient rock-cut city carved directly into vibrant rose-red sandstone cliffs", fact: "The Nabataeans engineered complex water conduits that allowed a metropolis to thrive in hyper-arid desert." },
  { name: "Dead Sea", sub: "Jordan / Israel / Palestine", lat: 31.559, lng: 35.473, hint: "Hypersaline lake whose shores are the lowest land elevation on Earth (-430 m)", fact: "Nearly 10 times saltier than the ocean, making it impossible for humans to sink." },
];

function makeMysteryRounds(pool, rng) {
  const chosen = shuffleWith(rng, pool).slice(0, ROUNDS);
  return chosen.map((country) => {
    const story = generateCountryStory(country);
    const c = country.gv;
    const name = nameOf(country);
    const clue1 = story.spark;
    let clue2 = "";
    if (c?.capital?.[0]) {
      clue2 = `Its capital and largest administrative center is ${c.capital[0]}.`;
    } else if (c?.area) {
      clue2 = `Spans ~${fmt.format(c.area)} km² of terrain across ${c.subregion || c.region}.`;
    } else {
      clue2 = `Located in the ${c.subregion || c.region} geographical zone.`;
    }
    const borders = (c?.borders || []).map((b) => S.byCca3.get(b)).filter(Boolean);
    let clue3 = "";
    if (borders.length > 0) {
      clue3 = `Borders: ${borders.slice(0, 3).map(nameOf).join(", ")}. Flag: ${flagEmoji(c.cca2)}`;
    } else {
      clue3 = `Surrounded entirely by ocean waters with no land borders. Flag: ${flagEmoji(c.cca2)}`;
    }
    return {
      arcadeMode: "mystery",
      country,
      clues: [clue1, clue2, clue3],
      fact: story.howItWorks,
      text: `Mystery Country: ${name}`,
      answer: name,
    };
  });
}

function makeChainRounds(pool, rng) {
  const valid = pool.filter((c) => (c.gv?.population || 0) > 10000 && (c.gv?.area || 0) > 100);
  const chain = shuffleWith(rng, valid).slice(0, ROUNDS + 1);
  const metrics = ["population", "area"];

  const rounds = [];
  for (let i = 0; i < ROUNDS; i++) {
    const base = chain[i];
    const target = chain[i + 1] || chain[0];
    const metric = metrics[Math.floor(rng() * metrics.length)];
    const valBase = metric === "population" ? base.gv.population : base.gv.area;
    const valTarget = metric === "population" ? target.gv.population : target.gv.area;
    const metricLabel = metric === "population" ? "Population 👥" : "Land Area 📐";
    const valBaseStr = metric === "population" ? fmt.format(valBase) + " people" : fmt.format(valBase) + " km²";
    const valTargetStr = metric === "population" ? fmt.format(valTarget) + " people" : fmt.format(valTarget) + " km²";

    rounds.push({
      arcadeMode: "chain",
      base,
      target,
      metric,
      metricLabel,
      valBase,
      valTarget,
      valBaseStr,
      valTargetStr,
      fact: `${nameOf(target)} has ${valTargetStr} compared to ${nameOf(base)}'s ${valBaseStr}.`,
      text: `${nameOf(target)} vs ${nameOf(base)} (${metricLabel})`,
      answer: valTarget >= valBase ? "MORE" : "FEWER / SMALLER",
    });
  }
  return rounds;
}

function makePinpointRounds(rng) {
  const chosen = shuffleWith(rng, PINPOINT_TARGETS).slice(0, ROUNDS);
  return chosen.map((target) => ({
    arcadeMode: "pinpoint",
    target,
    fact: target.fact,
    text: `Pinpoint ${target.name}`,
    answer: `${target.name} (${target.sub})`,
  }));
}

function quizPool(type, region, diff) {
  if (type === "wonder") return [...WONDERS];
  const typeOk = {
    capital: (c) => c.capital?.[0],
    city: (c) => c.capital?.[0],
    borders: (c) => (c.borders || []).filter((b) => S.byCca3.get(b)).length >= 2,
    duel: (c) => c.population != null && c.area,
  }[type] || (() => true);
  const base = uniqueCountries().filter((f) => (region === "World" || f.gv.region === region) && typeOk(f.gv));
  // easier levels use the most populous (best-known) countries, relaxing until the arena has enough
  for (const min of DIFF_RULES[diff].minPop) {
    const pool = min ? base.filter((f) => (f.gv.population ?? 0) >= min) : base;
    if (pool.length >= 12) return pool;
  }
  return base;
}

// All rounds are generated up front from the seed, so a shared link reproduces them exactly.
function makeRounds(type, pool, rng, diff) {
  const order = shuffleWith(rng, pool);
  return Array.from({ length: ROUNDS }, (_, i) => makeRound(type, order[i % order.length], pool, rng, diff));
}

function makeRound(type, t, pool, rng, diff) {
  const pickOthers = (pred, n) => shuffleWith(rng, pool.filter(pred)).slice(0, n);
  const flag = (f) => `<span class="qp-flag">${flagEmoji(f.gv.cca2)}</span>`;
  const gold = (s) => `<b style="color:var(--gold)">${esc(s)}</b>`;

  if (type === "find") {
    return { target: t, html: `${flag(t)} Find ${gold(nameOf(t))}`, text: `Find ${nameOf(t)}`, answer: nameOf(t) };
  }
  if (type === "wonder") {
    return {
      wonder: t, km: DIFF_RULES[diff].wonderKm,
      html: `<span class="qp-flag">${t.emoji}</span> Find ${gold(t.name)} <span style="font-size:13px;color:var(--text-dim)">(${t.kind} · within ${fmtFull.format(DIFF_RULES[diff].wonderKm)} km)</span>`,
      text: `Find ${t.name}`, answer: t.name,
    };
  }
  if (type === "capital") {
    const correct = t.gv.capital[0];
    const wrong = [...new Set(pickOthers((f) => f !== t && f.gv.capital?.[0] && f.gv.capital[0] !== correct, 5).map((f) => f.gv.capital[0]))].slice(0, 3);
    return {
      target: t, correct, options: shuffleWith(rng, [correct, ...wrong]), fly: true,
      html: `${flag(t)} Capital of ${gold(nameOf(t))}?`, text: `Capital of ${nameOf(t)}?`, answer: correct,
      explain: `❌ It's ${correct}.`,
    };
  }
  if (type === "city") {
    const city = t.gv.capital[0];
    const wrong = pickOthers((f) => f !== t && f.gv.capital?.[0] !== city, 3).map(nameOf);
    return {
      target: t, correct: nameOf(t), options: shuffleWith(rng, [nameOf(t), ...wrong]),
      html: `🏙️ ${gold(city)} is the capital of…?`, text: `${city} is the capital of…?`, answer: nameOf(t),
      explain: `❌ ${city} is the capital of ${nameOf(t)}.`,
    };
  }
  if (type === "borders") {
    const neighbours = shuffleWith(rng, (t.gv.borders || []).map((b) => S.byCca3.get(b)).filter(Boolean)).slice(0, 3);
    const nb = new Set(neighbours.map((n) => n.gv.cca3));
    // distractors must not border every listed neighbour, or the round would have two right answers
    const wrong = pickOthers((f) => f !== t && !nb.has(f.gv.cca3) && ![...nb].every((b) => (f.gv.borders || []).includes(b)), 3).map(nameOf);
    const list = neighbours.map((n) => `${flagEmoji(n.gv.cca2)} ${nameOf(n)}`).join(", ");
    return {
      target: t, correct: nameOf(t), options: shuffleWith(rng, [nameOf(t), ...wrong]),
      html: `🤝 Which country borders ${gold(list)}?`, text: `Which country borders ${neighbours.map(nameOf).join(", ")}?`,
      answer: nameOf(t), explain: `❌ It was ${nameOf(t)}.`,
    };
  }
  if (type === "duel") {
    const metric = rng() < 0.55 ? "population" : "area";
    const rival = pickOthers((f) => f !== t, 1)[0];
    const val = (f) => (metric === "population" ? f.gv.population : f.gv.area);
    const winner = val(t) >= val(rival) ? t : rival;
    const loser = winner === t ? rival : t;
    const label = (f) => `${flagEmoji(f.gv.cca2)} ${nameOf(f)}`;
    const unit = metric === "area" ? " km²" : " people";
    return {
      target: winner, correct: label(winner), options: shuffleWith(rng, [label(t), label(rival)]),
      html: `📏 Bigger ${gold(metric === "population" ? "population 👥" : "area 📐")}?`,
      text: `Bigger ${metric}: ${nameOf(t)} or ${nameOf(rival)}?`,
      answer: `${nameOf(winner)} (${fmt.format(val(winner))}${unit})`,
      explain: `❌ ${nameOf(winner)}: ${fmt.format(val(winner))} vs ${nameOf(loser)}: ${fmt.format(val(loser))}${unit}`,
    };
  }
  // flag
  const wrong = pickOthers((f) => f !== t, 3).map(nameOf);
  return {
    target: t, correct: nameOf(t), options: shuffleWith(rng, [nameOf(t), ...wrong]),
    html: `<img src="${t.gv.flags.png}" alt="Mystery flag" style="height:64px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.5)" /><br/>Whose flag is this?`,
    text: `Whose flag is this? ${flagEmoji(t.gv.cca2)}`, answer: nameOf(t),
    explain: `❌ That's the flag of ${nameOf(t)}.`,
  };
}

function setQuizSelection(type, region, diff) {
  S.quizType = type; S.quizRegion = region; S.quizDiff = diff;
  $$("#quizTypeSeg .seg-btn").forEach((x) => x.classList.toggle("active", x.dataset.qtype === type));
  $$("#quizRegionSeg .seg-btn").forEach((x) => x.classList.toggle("active", x.dataset.region === region));
  $$("#quizDiffSeg .seg-btn").forEach((x) => x.classList.toggle("active", x.dataset.diff === diff));
  updateQuizBestLabels();
}

function updateQuizBestLabels() {
  updateArenaAvailability();
  $("#quizBestLabel").textContent = S.bests[`${S.quizType}|${S.quizRegion}|${S.quizDiff}`] || 0;
  $("#quizBestOverall").textContent = store.get("gv-best", 0);
}

// Some games can't run in some arenas (Oceania's island nations have no land neighbours) — grey those out.
function updateArenaAvailability() {
  if (!S.features.length) return;
  $$("#quizRegionSeg .seg-btn").forEach((b) => {
    const ok = quizPool(S.quizType, b.dataset.region, S.quizDiff).length >= 8;
    b.disabled = !ok;
    b.title = ok ? "" : "Not enough countries for this game here";
  });
  if (quizPool(S.quizType, S.quizRegion, S.quizDiff).length < 8) {
    S.quizRegion = "World";
    $$("#quizRegionSeg .seg-btn").forEach((x) => x.classList.toggle("active", x.dataset.region === "World"));
  }
}

// A friend's link arrives → pre-select their game and lock in their seed
function setArcadeMode(mode) {
  S.arcadeMode = mode;
  $$("#arcadeModeGrid .arcade-card").forEach((c) => c.classList.toggle("active", c.dataset.arcade === mode));
  $("#blitzTypeWrap")?.classList.toggle("hidden", mode !== "blitz");
  updateQuizBestLabels();
}

function applyChallenge(code) {
  const ch = decodeChallenge(code);
  if (!ch) { toast("⚠️ That challenge link looks broken — pick a game instead"); return false; }
  S.pendingChallenge = { ...ch, code: encodeChallenge(ch) };
  setArcadeMode("blitz"); // classic challenge codes (Flag Frenzy, Capitals, …) are Blitz games
  setQuizSelection(ch.type, ch.region, ch.diff);
  if (S.mode !== "quiz") setMode("quiz");
  else $("#quizSetup").classList.remove("hidden");
  renderChallengeBanner();
  scheduleUrl();
  return true;
}

function renderChallengeBanner() {
  const b = $("#challengeBanner");
  const ch = S.pendingChallenge;
  b.classList.toggle("hidden", !ch);
  if (!ch) return;
  b.innerHTML = `🔗 <b>You've been challenged!</b> ${QUIZ_TYPE_LABEL[ch.type]} · ${ch.region} · ${DIFF_LABEL[ch.diff]} — the exact 10 questions your friend got.
    <button id="challengeDrop" class="cb-drop">Play my own instead</button>`;
  $("#challengeDrop").addEventListener("click", () => { S.pendingChallenge = null; renderChallengeBanner(); scheduleUrl(); });
}

// Changing the game/arena/difficulty means it's no longer the friend's challenge
function dropChallengeIfChanged() {
  const ch = S.pendingChallenge;
  if (ch && (ch.type !== S.quizType || ch.region !== S.quizRegion || ch.diff !== S.quizDiff)) {
    S.pendingChallenge = null;
    renderChallengeBanner();
    scheduleUrl();
  }
}

function startQuiz() {
  const arcadeMode = S.arcadeMode || "mystery";
  const type = S.quizType, region = S.quizRegion, diff = S.quizDiff;
  const pool = quizPool(type, region, diff);
  if (pool.length < 8 && arcadeMode !== "pinpoint") { toast("Not enough countries in that arena — try 🌍 World!"); return; }
  const ch = S.pendingChallenge;
  const seed = ch ? ch.seed : crypto.getRandomValues(new Uint32Array(1))[0];
  const rng = mulberry32(seed);
  S.pendingChallenge = null;
  renderChallengeBanner();

  let rounds;
  if (arcadeMode === "mystery") {
    rounds = makeMysteryRounds(pool, rng);
  } else if (arcadeMode === "chain") {
    rounds = makeChainRounds(pool, rng);
  } else if (arcadeMode === "pinpoint") {
    rounds = makePinpointRounds(rng);
  } else {
    rounds = makeRounds(type, pool, rng, diff);
  }

  S.quiz = {
    arcadeMode, type, region, diff, seed,
    code: encodeChallenge({ type: arcadeMode, region, diff, seed }),
    rounds,
    maxAttempts: arcadeMode === "mystery" ? 3 : DIFF_RULES[diff].attempts,
    log: [],
    round: 0, score: 0, streak: 0, bestStreak: 0, correct: 0,
    target: null, cur: null, attempts: 0, locked: false, explain: "",
  };
  $("#quizSetup").classList.add("hidden");
  $("#quizResult").classList.add("hidden");
  $("#quizHud .quiz-card.hud")?.classList.remove("collapsed");
  $("#quizHud").classList.remove("hidden");
  $("#hudHint").textContent = QUIZ_HINTS[arcadeMode] || QUIZ_HINTS[type] || "Play with the 3D globe!";
  S.globe.pointOfView(viewFor(15, 20, 2.6 * stageZoom()), 900);
  refreshHtmlLayer();
  scheduleUrl();
  nextRound();
}

function nextRound() {
  const q = S.quiz;
  if (!q) return;
  q.round++;
  q.attempts = 0;
  q.locked = false;
  q.chainArc = null;
  q.pinpointArc = null;
  refreshArcs();

  if (q.round > ROUNDS) return finishQuiz();

  const r = q.rounds[q.round - 1];
  q.cur = r;

  $("#quizRound").textContent = `${q.round}/${ROUNDS}`;
  $("#quizScore").textContent = `${q.score} pts`;
  $("#quizStreak").textContent = `🔥 ${q.streak}`;
  $("#quizFeedback").textContent = "";
  $("#quizFeedback").className = "";
  $("#quizStoryFact").classList.add("hidden");
  $("#quizStoryFact").innerHTML = "";

  // Reset all mode containers
  $("#mysteryCluesBox").classList.add("hidden");
  $("#chainBox").classList.add("hidden");
  $("#pinpointBox").classList.add("hidden");
  $("#quizOptions").classList.add("hidden");

  if (q.arcadeMode === "mystery") {
    q.target = r.country;
    $("#quizPrompt").innerHTML = `<h3>3-Clue Mystery Hunt</h3><p>Spin the globe and click the mystery country directly on the planet!</p>`;
    const mBox = $("#mysteryCluesBox");
    mBox.classList.remove("hidden");
    $("#mysteryClueText1").textContent = r.clues[0];
    $("#mysteryClue1").className = "clue-item";
    $("#mysteryClueText2").textContent = "Guess once to unlock Clue 2...";
    $("#mysteryClue2").className = "clue-item locked";
    $("#mysteryClueText3").textContent = "Guess twice to unlock Clue 3...";
    $("#mysteryClue3").className = "clue-item locked";
    refreshPolys();
  } else if (q.arcadeMode === "chain") {
    q.target = r.target;
    const base = r.base, target = r.target;
    const ca = centroidOf(base), cb = centroidOf(target);
    const dist = Math.round(haversine(ca, cb));
    q.chainArc = { sLat: ca.lat, sLng: ca.lng, eLat: cb.lat, eLng: cb.lng, km: dist, glow: false };
    refreshArcs();

    $("#quizPrompt").innerHTML = `<h3>Higher or Lower: Globe Chain</h3><p>Does <b>${nameOf(target)}</b> have MORE or FEWER/SMALLER ${r.metricLabel} than <b>${nameOf(base)}</b>?</p>`;
    const cBox = $("#chainBox");
    cBox.classList.remove("hidden");

    $("#chainBaseName").textContent = `${flagEmoji(base.gv.cca2)} ${nameOf(base)}`;
    $("#chainBaseStat").textContent = r.valBaseStr;
    $("#chainBaseBar").style.width = "75%";

    $("#chainTargetName").textContent = `${flagEmoji(target.gv.cca2)} ${nameOf(target)}`;
    $("#chainTargetStat").textContent = "???";

    const higherBtn = $("#chainHigherBtn");
    const lowerBtn = $("#chainLowerBtn");
    higherBtn.disabled = false;
    lowerBtn.disabled = false;
    higherBtn.onclick = () => answerChain(true);
    lowerBtn.onclick = () => answerChain(false);

    const midLat = (ca.lat + cb.lat) / 2;
    const midLng = (ca.lng + cb.lng) / 2;
    S.globe.pointOfView({ lat: midLat, lng: midLng, altitude: 2.1 }, 1200);
    flash(base, "rgba(56,189,248,0.7)", 8000);
    refreshPolys();
  } else if (q.arcadeMode === "pinpoint") {
    q.target = r.target;
    $("#quizPrompt").innerHTML = `<h3>Pinpoint Drop</h3><p>Click / tap as close as possible on the 3D globe to the target location!</p>`;
    const pBox = $("#pinpointBox");
    pBox.classList.remove("hidden");
    $("#pinpointTargetName").textContent = r.target.name;
    $("#pinpointTargetHint").textContent = `${r.target.sub} · ${r.target.hint}`;
    $("#pinpointMeter").classList.add("hidden");
    const pov = S.globe.pointOfView();
    S.globe.pointOfView({ lat: r.target.lat, lng: pov.lng, altitude: 2.4 }, 900);
  } else {
    // Mode D: Classic Trivia Blitz
    q.target = r.wonder || r.target;
    q.explain = r.explain || "";
    $("#quizPrompt").innerHTML = r.html;
    if (r.options) buildOptions(r.options, r.correct);
    if (r.fly) flyTo(r.target, 1200);
    refreshPolys();
  }
}

function showQuizStoryFact(fact) {
  const el = $("#quizStoryFact");
  if (!el || !fact) return;
  el.innerHTML = `<span class="qsf-icon">💡</span><span class="qsf-text">${fact}</span>`;
  el.classList.remove("hidden");
}

function quizMysteryClick(d, ev) {
  const q = S.quiz;
  if (!q || q.locked || !d || q.arcadeMode !== "mystery") return;
  const target = q.target;
  const fb = $("#quizFeedback");

  if (d === target) {
    q.locked = true;
    const cluePts = q.attempts === 0 ? 300 : q.attempts === 1 ? 200 : 100;
    const pts = award(cluePts);
    fb.innerHTML = `✅ <b>Bullseye!</b> That's <b>${nameOf(d)}</b> (+${pts} pts)`;
    fb.className = "good";
    logRound("correct", nameOf(d));
    flash(d, "rgba(16,185,129,0.9)", 1400);
    ringPulse(centroidOf(d).lat, centroidOf(d).lng, 4, "16,185,129");
    confetti({
      particleCount: 90, spread: 75,
      origin: { x: (ev?.clientX ?? innerWidth / 2) / innerWidth, y: (ev?.clientY ?? innerHeight / 2) / innerHeight },
      colors: ["#10B981", "#38BDF8", "#F59E0B"],
    });

    if (q.cur.fact) showQuizStoryFact(q.cur.fact);
    setTimeout(nextRound, 2600);
  } else {
    q.attempts++;
    const dist = Math.round(haversine(centroidOf(d), centroidOf(target)));
    const dir = bearingArrow(centroidOf(d), centroidOf(target));

    let tempClass = "cold";
    let tempLabel = "❄️ Freezing Cold";
    let flashColor = "rgba(56,189,248,0.85)";

    if (dist < 1500) {
      tempClass = "hot";
      tempLabel = "🔥 Burning Hot!";
      flashColor = "rgba(244,63,94,0.9)";
    } else if (dist <= 5000) {
      tempClass = "warm";
      tempLabel = "☀️ Getting Warmer";
      flashColor = "rgba(245,158,11,0.85)";
    }

    flash(d, flashColor, 800);
    ringPulse(centroidOf(d).lat, centroidOf(d).lng, 2.5, tempClass === "hot" ? "244,63,94" : tempClass === "warm" ? "245,158,11" : "56,189,248");

    if (q.attempts >= q.maxAttempts) {
      q.locked = true;
      q.streak = 0;
      fb.innerHTML = `❌ Out of clues! It was <b>${nameOf(target)}</b>`;
      fb.className = "bad";
      logRound("wrong", nameOf(d));
      flash(target, "rgba(245,158,11,0.95)", 2400);
      flyTo(target, 1100);
      if (q.cur.fact) showQuizStoryFact(q.cur.fact);
      setTimeout(nextRound, 3000);
    } else {
      fb.innerHTML = `<span class="radar-pill ${tempClass}">${tempLabel}</span> That's <b>${nameOf(d)}</b> — ${fmtFull.format(dist)} km away, head <b>${dir}</b>!`;
      fb.className = "bad";
      if (q.attempts === 1) {
        $("#mysteryClueText2").textContent = q.cur.clues[1];
        $("#mysteryClue2").className = "clue-item";
      } else if (q.attempts === 2) {
        $("#mysteryClueText3").textContent = q.cur.clues[2];
        $("#mysteryClue3").className = "clue-item";
      }
    }
    $("#quizStreak").textContent = `🔥 ${q.streak}`;
  }
  $("#quizScore").textContent = `${q.score} pts`;
}

function answerChain(isHigher) {
  const q = S.quiz;
  if (!q || q.locked || q.arcadeMode !== "chain") return;
  q.locked = true;
  const r = q.cur;
  const higherBtn = $("#chainHigherBtn");
  const lowerBtn = $("#chainLowerBtn");
  higherBtn.disabled = true;
  lowerBtn.disabled = true;

  const targetStatEl = $("#chainTargetStat");
  targetStatEl.textContent = r.valTargetStr;

  const isCorrect = isHigher ? r.valTarget >= r.valBase : r.valTarget <= r.valBase;
  const fb = $("#quizFeedback");

  if (isCorrect) {
    const pts = award(150);
    fb.innerHTML = `✅ <b>Correct!</b> ${nameOf(r.target)} has ${r.valTargetStr} (+${pts} pts)`;
    fb.className = "good";
    logRound("correct", isHigher ? "MORE" : "FEWER");
    flash(r.target, "rgba(16,185,129,0.9)", 1400);
    confetti({ particleCount: 75, spread: 70, origin: { x: 0.5, y: 0.4 }, colors: ["#10B981", "#38BDF8"] });
    flyTo(r.target, 1100);
    if (r.fact) showQuizStoryFact(r.fact);
    setTimeout(nextRound, 2000);
  } else {
    q.streak = 0;
    fb.innerHTML = `❌ <b>Streak Broken!</b> ${nameOf(r.target)} has ${r.valTargetStr}`;
    fb.className = "bad";
    logRound("wrong", isHigher ? "MORE" : "FEWER");
    flash(r.target, "rgba(244,63,94,0.85)", 1400);
    flyTo(r.target, 1100);
    if (r.fact) showQuizStoryFact(r.fact);
    setTimeout(nextRound, 2600);
  }
  $("#quizStreak").textContent = `🔥 ${q.streak}`;
  $("#quizScore").textContent = `${q.score} pts`;
}

function quizPinpointClick(coords) {
  const q = S.quiz;
  if (!q || q.locked || !coords || q.arcadeMode !== "pinpoint") return;
  q.locked = true;
  const t = q.target;
  const dist = Math.round(haversine(coords, t));

  let pts = 0;
  if (dist <= 50) pts = 1000;
  else if (dist <= 2500) pts = Math.round(1000 * Math.max(0, 1 - dist / 2500));
  else pts = 0;

  q.score += pts;
  if (pts >= 400) { q.streak++; q.correct++; } else { q.streak = 0; }
  q.bestStreak = Math.max(q.bestStreak, q.streak);

  q.pinpointArc = { sLat: coords.lat, sLng: coords.lng, eLat: t.lat, eLng: t.lng, km: dist, glow: false };
  refreshArcs();

  ringPulse(coords.lat, coords.lng, 2.5, "244,63,94");
  ringPulse(t.lat, t.lng, 3.5, "16,185,129");

  const meter = $("#pinpointMeter");
  meter.classList.remove("hidden");
  $("#pinpointDistance").textContent = `${fmtFull.format(dist)} km off target`;
  $("#pinpointScore").textContent = `+${pts} pts`;

  const fb = $("#quizFeedback");
  if (pts >= 700) {
    fb.innerHTML = `🎯 <b>Incredible accuracy!</b> Just ${fmtFull.format(dist)} km away.`;
    fb.className = "good";
    confetti({ particleCount: 90, spread: 80, origin: { x: 0.5, y: 0.4 } });
  } else if (pts >= 350) {
    fb.innerHTML = `👍 <b>Good estimation!</b> ${fmtFull.format(dist)} km away.`;
    fb.className = "good";
  } else {
    fb.innerHTML = `📍 Target was ${fmtFull.format(dist)} km away.`;
    fb.className = "bad";
  }

  logRound(pts >= 400 ? "correct" : "wrong", `${fmtFull.format(dist)} km off`);
  if (q.cur.fact) showQuizStoryFact(q.cur.fact);

  S.globe.pointOfView({ lat: t.lat, lng: t.lng, altitude: 1.2 }, 1200);

  $("#quizStreak").textContent = `🔥 ${q.streak}`;
  $("#quizScore").textContent = `${q.score} pts`;

  setTimeout(nextRound, 3200);
}

// Record each round exactly once for the results review + emoji scorecard
function logRound(result, given = "") {
  const q = S.quiz;
  if (!q || q.log.length >= q.round) return;
  sfx(result);
  const r = q.cur;
  let place = {};
  if (r.country) place = { cca3: r.country.gv.cca3 };
  else if (r.target?.gv) place = { cca3: r.target.gv.cca3 };
  else if (r.target?.name) place = { wonder: r.target.name };
  else if (r.wonder) place = { wonder: r.wonder.name };
  q.log.push({
    n: q.round, result, given, text: r.text, answer: r.answer,
    place,
  });
}

/* Wonder Hunt — click anywhere on the planet, judged by distance */
function quizWonderClick(coords) {
  const q = S.quiz;
  if (!q || q.type !== "wonder" || q.locked || !coords) return;
  const w = q.target;
  const tol = q.cur.km;
  const dist = haversine(coords, w);
  const fb = $("#quizFeedback");

  if (dist <= tol) {
    q.locked = true;
    const bonus = dist < tol * 0.35 ? 40 : 0;
    const pts = award(100 + bonus);
    fb.textContent = `✅ +${pts} pts — only ${fmtFull.format(Math.round(dist))} km off${bonus ? " · bullseye!" : ""}`;
    fb.className = "good";
    logRound("correct", `${fmtFull.format(Math.round(dist))} km off`);
    ringPulse(w.lat, w.lng, 3.5, "61,220,132");
    confetti({ particleCount: 90, spread: 75, origin: { x: 0.5, y: 0.35 }, colors: ["#3ddc84", "#ffd166", "#4db8ff"] });
    setTimeout(nextRound, 1600);
  } else {
    q.attempts++;
    if (q.attempts >= q.maxAttempts) {
      q.locked = true;
      q.streak = 0;
      fb.innerHTML = `❌ It's here — <b>${esc(w.name)}</b>`;
      fb.className = "bad";
      logRound("wrong", `${fmtFull.format(Math.round(dist / 100) * 100)} km off`);
      ringPulse(w.lat, w.lng, 4, "255,209,102");
      S.globe.pointOfView({ lat: w.lat, lng: w.lng, altitude: 1.1 }, 1100);
      pauseRotate();
      setTimeout(nextRound, 2500);
    } else {
      fb.innerHTML = `${fmtFull.format(Math.round(dist / 100) * 100)} km away — head ${bearingArrow(coords, w)}`;
      fb.className = "bad";
    }
    $("#quizStreak").textContent = `🔥 ${q.streak}`;
  }
  $("#quizScore").textContent = `${q.score} pts`;
}

function buildOptions(options, correct) {
  const box = $("#quizOptions");
  const keys = "ABCDEFGHIJ";
  box.classList.remove("hidden");
  box.innerHTML = options.map((o, i) =>
    `<button class="q-opt" data-c="${o === correct ? 1 : 0}"><kbd class="q-key" aria-hidden="true">${keys[i]}</kbd>${esc(o)}</button>`).join("");
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
    logRound("correct");
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
    if (q.attempts >= q.maxAttempts) {
      q.locked = true;
      q.streak = 0;
      fb.innerHTML = `❌ It was here — <b>${esc(nameOf(q.target))}</b>`;
      fb.className = "bad";
      logRound("wrong", nameOf(d));
      flash(q.target, "rgba(255,209,102,0.9)", 2100);
      flyTo(q.target, 1000);
      setTimeout(nextRound, 2400);
    } else {
      const dist = haversine(centroidOf(d), centroidOf(q.target));
      const hint = q.attempts === q.maxAttempts - 1 && q.maxAttempts > 2 ? ` · hint: it's in ${q.target.gv.subregion || q.target.gv.region}` : "";
      fb.innerHTML = `That's ${esc(nameOf(d))}. Head ${bearingArrow(centroidOf(d), centroidOf(q.target))} ≈ ${fmtFull.format(Math.round(dist / 100) * 100)} km${hint}`;
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
    logRound("correct");
    flash(q.target, "rgba(61,220,132,0.85)", 1100);
    confetti({ particleCount: 80, spread: 70, origin: { x: 0.5, y: 0.35 }, colors: ["#3ddc84", "#ffd166", "#4db8ff"] });
  } else {
    btn.classList.add("wrong");
    q.streak = 0;
    fb.textContent = q.explain || "❌ Not quite.";
    fb.className = "bad";
    logRound("wrong", btn.textContent.replace(/^[A-J]/, "").trim());
  }
  if (!q.cur.fly && q.target) flyTo(q.target, 1100);
  const fact = q.cur.fact || (q.target?.gv ? generateCountryStory(q.target)?.spark : "");
  if (fact) showQuizStoryFact(fact);
  $("#quizScore").textContent = `${q.score} pts`;
  $("#quizStreak").textContent = `🔥 ${q.streak}`;
  setTimeout(nextRound, 2200);
}

function skipRound() {
  const q = S.quiz;
  if (!q || q.locked) return;
  q.streak = 0;
  logRound("skipped");
  if (q.arcadeMode === "mystery") {
    q.locked = true;
    flash(q.target, "rgba(245,158,11,0.95)", 2000);
    flyTo(q.target, 1000);
    $("#quizFeedback").innerHTML = `It was <b>${esc(nameOf(q.target))}</b>`;
    $("#quizFeedback").className = "bad";
    if (q.cur.fact) showQuizStoryFact(q.cur.fact);
    setTimeout(nextRound, 2500);
  } else if (q.arcadeMode === "chain") {
    q.locked = true;
    $("#quizFeedback").innerHTML = `Skipped duel — ${nameOf(q.cur.target)} has ${q.cur.valTargetStr}`;
    $("#quizFeedback").className = "bad";
    setTimeout(nextRound, 2000);
  } else if (q.arcadeMode === "pinpoint") {
    q.locked = true;
    const t = q.target;
    ringPulse(t.lat, t.lng, 3.5, "245,158,11");
    S.globe.pointOfView({ lat: t.lat, lng: t.lng, altitude: 1.2 }, 1000);
    $("#quizFeedback").innerHTML = `Target was here — <b>${t.name}</b>`;
    $("#quizFeedback").className = "bad";
    if (q.cur.fact) showQuizStoryFact(q.cur.fact);
    setTimeout(nextRound, 2600);
  } else if (q.type === "find") {
    q.locked = true;
    flash(q.target, "rgba(255,209,102,0.9)", 1800);
    flyTo(q.target, 900);
    $("#quizFeedback").innerHTML = `It was <b>${esc(nameOf(q.target))}</b>`;
    $("#quizFeedback").className = "bad";
    setTimeout(nextRound, 2000);
  } else if (q.type === "wonder") {
    q.locked = true;
    const w = q.target;
    ringPulse(w.lat, w.lng, 4, "255,209,102");
    S.globe.pointOfView({ lat: w.lat, lng: w.lng, altitude: 1.1 }, 1000);
    pauseRotate();
    $("#quizFeedback").innerHTML = `It's here — <b>${esc(w.name)}</b>`;
    $("#quizFeedback").className = "bad";
    setTimeout(nextRound, 2200);
  } else nextRound();
}

const RESULT_ICON = { correct: "✅", wrong: "❌", skipped: "⏭️" };

function finishQuiz() {
  const q = S.quiz;
  $("#quizHud").classList.add("hidden");
  const modeKey = q.arcadeMode || q.type;
  const key = `${modeKey}|${q.region}|${q.diff}`;
  const newBest = q.score > (S.bests[key] || 0);
  if (newBest) { S.bests[key] = q.score; store.set("gv-bests", S.bests); }
  if (q.score > store.get("gv-best", 0)) store.set("gv-best", q.score);

  const pct = q.correct / ROUNDS;
  const [emoji, title] =
    pct === 1 ? ["👑", "Flawless. Atlas himself would be proud."] :
    pct >= 0.8 ? ["🏆", "Outstanding geographer!"] :
    pct >= 0.5 ? ["🌍", "Solid explorer — keep charting!"] :
    ["🧭", "The world is big. Keep exploring!"];

  $("#resultEmoji").textContent = emoji;
  $("#resultTitle").textContent = title;
  const modeLabel = QUIZ_TYPE_LABEL[q.arcadeMode] || QUIZ_TYPE_LABEL[q.type] || "Arcade";
  $("#resultStats").innerHTML =
    `<b>${q.score} pts</b> · ${q.correct}/${ROUNDS} correct · best streak 🔥 ${q.bestStreak}` +
    `<br/><span class="res-meta">${modeLabel} · ${q.region} · ${DIFF_LABEL[q.diff]} · seed: <code>${q.seed}</code></span>` +
    (newBest ? `<br/><span style="color:var(--gold)">✨ New personal best for this game!</span>` : ``);

  $("#resultReview").innerHTML = q.log.map((e, i) => `
    <li><button class="rv-item ${e.result}" data-i="${i}">
      <span class="rv-icon" aria-label="${e.result}">${RESULT_ICON[e.result]}</span>
      <span class="rv-body"><span class="rv-q">${e.n}. ${esc(e.text)}</span>
        <span class="rv-a">${esc(e.answer)}${e.result === "wrong" && e.given ? ` <i>· you: ${esc(e.given)}</i>` : ""}</span></span>
      <span class="rv-go" aria-hidden="true">→</span>
    </button></li>`).join("");
  $$("#resultReview .rv-item").forEach((b) => b.addEventListener("click", () => reviewJump(q.log[+b.dataset.i])));

  S.lastQuiz = q;
  S.quiz = null;
  refreshArcs();
  $("#quizResult").classList.remove("hidden");
  $("#quizResult .quiz-card").scrollTop = 0;
  if (newBest) confetti({ particleCount: 160, spread: 100, origin: { y: 0.4 } });
  refreshHtmlLayer();
}

// Results review → close the quiz and fly to that place's drawer / story card
async function reviewJump(entry) {
  if (entry.place?.cca3) {
    setMode("explore");
    selectCountry(S.byCca3.get(entry.place.cca3));
  } else if (entry.place?.wonder) {
    setMode("explore");
    const l = await findPhysical(entry.place.wonder);
    if (l) openPhysical(l);
  }
}

function challengeUrl(q) {
  if (typeof q === "string") return `${location.origin}${location.pathname}?challenge=${q}`;
  const mode = q?.arcadeMode || q?.type || "mystery";
  return `${location.origin}${location.pathname}?game=${mode}&seed=${q.seed}&region=${q.region}&diff=${q.diff}`;
}

function scorecardText(q) {
  const modeLabel = QUIZ_TYPE_LABEL[q.arcadeMode] || QUIZ_TYPE_LABEL[q.type] || "Arcade Challenge";
  return [
    `GeoVerse 🌍 ${modeLabel} · ${q.region} · ${DIFF_LABEL[q.diff]}`,
    q.log.map((e) => RESULT_ICON[e.result]).join(""),
    `🏆 ${q.score} pts · ${q.correct}/${ROUNDS} correct · 🔥 ${q.bestStreak} best streak`,
    `Can you beat my score? ${challengeUrl(q)}`,
  ].join("\n");
}

async function shareChallenge() {
  const q = S.lastQuiz;
  if (!q) return;
  const url = challengeUrl(q);
  const ok = await copyText(url);
  toast(ok ? "🔗 Seeded challenge link copied — your friend gets the exact same questions!" : `Copy this link: ${url}`, 3600);
}

async function shareScorecard() {
  const q = S.lastQuiz;
  if (!q) return;
  const ok = await copyText(scorecardText(q));
  toast(ok ? "📋 Scorecard copied — paste it anywhere!" : "⚠️ Couldn't reach the clipboard", 3200);
}

function endQuiz(silent = false) {
  S.quiz = null;
  refreshArcs(); // a game's arcs (Chain, Pinpoint) go away with it
  $("#quizHud").classList.add("hidden");
  $("#quizSetup").classList.add("hidden");
  $("#quizResult").classList.add("hidden");
  refreshHtmlLayer();
  if (!silent) setMode("explore");
}

/* ───────────────────────── BOTTOM SHEETS (mobile) ───────────────────────── */
// Drawer + data/physical docks become draggable sheets: peek (globe stays usable above),
// half and expanded. Drag the grip/header, flick, or tap the grip to cycle.
const SNAP = { peek: 0.28, half: 0.55, full: 0.88 };
const SNAP_ORDER = ["peek", "half", "full"];
const sheets = new Map(); // element → { state, def, dismiss, onSnap }

const sheetShown = (el) => !el.classList.contains("hidden");

function sheetPx(state) {
  const max = innerHeight - navHeight() - 8;
  return Math.round(Math.min(max, innerHeight * SNAP[state]));
}

// Height of the tallest visible sheet — the camera and floating HUD keep clear of it
function tallestSheet() {
  if (!isMobile()) return 0;
  let h = 0;
  for (const [el, sh] of sheets) if (sheetShown(el)) h = Math.max(h, sheetPx(sh.state));
  return h;
}

function setSheet(el, state, animate = true) {
  const sh = sheets.get(el);
  if (!sh) return;
  const changed = sh.state !== state;
  sh.state = state;
  if (!isMobile()) {
    el.style.height = "";
    el.style.transition = "";
    delete el.dataset.sheet;
  } else {
    el.style.transition = animate ? "height .34s cubic-bezier(.2,.9,.3,1)" : "none";
    el.style.height = sheetPx(state) + "px";
    el.dataset.sheet = state;
  }
  updateHudLift();
  if (changed && animate && isMobile()) sh.onSnap?.(state);
}

function updateHudLift() {
  const root = document.documentElement.style;
  root.setProperty("--nav-h", navHeight() + "px");
  root.setProperty("--sheet-h", tallestSheet() + "px");
  let tall = false;
  if (isMobile()) for (const [el, sh] of sheets) if (sheetShown(el) && sh.state !== "peek") tall = true;
  document.body.classList.toggle("sheet-tall", tall);
}

function initSheet(el, { def = "half", dismiss = null, onSnap = null } = {}) {
  const sh = { state: def, def, dismiss, onSnap };
  sheets.set(el, sh);

  // every time the sheet appears it opens at its default snap
  new MutationObserver(() => {
    if (sheetShown(el)) {
      if (!el._shown) { el._shown = true; setSheet(el, sh.def, false); }
    } else {
      el._shown = false;
      sh.state = sh.def;
      updateHudLift();
    }
  }).observe(el, { attributes: true, attributeFilter: ["class"] });

  const handles = [el.querySelector(".sheet-grip"), el.id === "panel" ? $("#panelHeader") : null].filter(Boolean);
  let drag = null;

  const onDown = (e) => {
    if (!isMobile() || (e.button ?? 0) > 0 || e.target.closest("button, a, input, iframe")) return;
    drag = { id: e.pointerId, y0: e.clientY, h0: el.offsetHeight, moved: false, tap: !!e.target.closest(".sheet-grip"), samples: [[e.clientY, e.timeStamp]] };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0;
    if (!drag.moved && Math.abs(dy) < 6) return;
    drag.moved = true;
    el.style.transition = "none";
    el.style.height = clamp(drag.h0 - dy, 64, innerHeight - navHeight() - 8) + "px";
    drag.samples.push([e.clientY, e.timeStamp]);
    if (drag.samples.length > 5) drag.samples.shift();
  };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moved) { // tap on the grip cycles peek → half → full
      if (d.tap) setSheet(el, SNAP_ORDER[(SNAP_ORDER.indexOf(sh.state) + 1) % SNAP_ORDER.length]);
      return;
    }
    const [ya, ta] = d.samples[0], [yb, tb] = d.samples[d.samples.length - 1];
    const v = (yb - ya) / Math.max(1, tb - ta); // px per ms, positive = downward flick
    const h = el.offsetHeight;
    if (sh.dismiss && (h < sheetPx("peek") * 0.7 || (v > 0.9 && h <= sheetPx("peek") + 24))) {
      el.style.transition = "transform .22s ease";
      el.style.transform = "translateY(110%)";
      setTimeout(() => { el.style.transform = ""; el.style.transition = ""; sh.dismiss(); }, 210);
      return;
    }
    const snaps = SNAP_ORDER.map((s) => [s, sheetPx(s)]);
    let target;
    if (v > 0.45) target = [...snaps].reverse().find(([, px]) => px < h - 10) || snaps[0];
    else if (v < -0.45) target = snaps.find(([, px]) => px > h + 10) || snaps[snaps.length - 1];
    else target = snaps.reduce((a, b) => (Math.abs(b[1] - h) < Math.abs(a[1] - h) ? b : a));
    setSheet(el, target[0]);
  };
  for (const hd of handles) {
    hd.addEventListener("pointerdown", onDown);
    hd.addEventListener("pointermove", onMove);
    hd.addEventListener("pointerup", onUp);
    hd.addEventListener("pointercancel", onUp);
  }
}

function initSheets() {
  initSheet($("#panel"), {
    def: "half",
    dismiss: () => closePanel(),
    onSnap: () => { // keep the subject centred in whatever globe is left visible
      if (S.compare) frameCompare(700);
      else if (S.selected) frameCountry(S.selected, 700);
    },
  });
  initSheet($("#atlasDock"), { def: "peek" });
  initSheet($("#earthDock"), { def: "peek" });

  const relayout = () => {
    for (const [el, sh] of sheets) if (sheetShown(el)) setSheet(el, sh.state, false);
    updateHudLift();
    if (S.mode === "atlas") renderAtlasReadout(null);
  };
  MOBILE_MQ.addEventListener("change", relayout);
  addEventListener("resize", relayout);
  updateHudLift();
}

/* ───────────────────────── URL STATE & BACK BUTTON ───────────────────────── */
// Every overlay level (quiz modal, drawer, state view, compare) owns one history entry,
// so Back peels them off one at a time before it ever leaves the page.
let urlQueued = false, urlPending = null, applyingUrl = false;

function urlLevel() {
  let L = 0;
  const quizUi = S.quiz || !$("#quizSetup").classList.contains("hidden") || !$("#quizResult").classList.contains("hidden");
  if (S.mode === "quiz" && quizUi) L++;
  if (panelVisible()) L++;
  if (S.stateView) L++;
  if (S.compare) L++;
  if (S.activeTour || !$("#toursModal")?.classList.contains("hidden")) L++;
  return L;
}

function buildUrl() {
  const p = new URLSearchParams();
  if (S.mode !== "explore") p.set("mode", S.mode);
  if (S.mode === "atlas" && S.atlasMetric !== "population") p.set("metric", S.atlasMetric);
  if (S.stateView) p.set("states", S.stateView.country.gv?.cca3 || "");
  if (panelVisible()) {
    if (S.info?.type === "feature") p.set("wonder", S.info.title);
    else if (S.info?.type === "state") p.set("state", S.info.title);
    else if (S.info?.type === "ideas") p.set("ideas", "1");
    else if (S.selected?.gv) p.set("country", S.selected.gv.cca3);
  }
  if (S.compare) p.set("compare", S.compare.b.gv.cca3);
  if (S.mode === "quiz") {
    if (S.quiz) {
      p.set("game", S.quiz.arcadeMode || S.quiz.type);
      p.set("seed", S.quiz.seed);
    } else if (S.pendingChallenge) {
      p.set("challenge", S.pendingChallenge.code);
    }
  }
  if (S.activeTour) {
    p.set("tour", S.activeTour.tour.id);
    p.set("stop", S.activeTour.stopIndex);
  }
  const qs = p.toString();
  return location.pathname + (qs ? "?" + qs : "") + location.hash;
}

function scheduleUrl() {
  if (applyingUrl || !S.urlReady || urlQueued) return;
  urlQueued = true;
  queueMicrotask(() => { urlQueued = false; commitUrl(); });
}

function commitUrl() {
  if (urlPending) return; // mid-unwind: the popstate handler re-evaluates when it lands
  const url = buildUrl(), L = urlLevel();
  const st = history.state || {};
  const C = st.gvLevel ?? 0, depth = st.gvDepth ?? 0;
  if (L > C) history.pushState({ gvLevel: L, gvDepth: depth + 1 }, "", url);
  else if (L < C && depth > 0) { urlPending = true; history.back(); } // closed via UI → consume our entry
  else if (url !== location.pathname + location.search + location.hash || L !== C) {
    history.replaceState({ gvLevel: L, gvDepth: depth }, "", url);
  }
}

function onPopState() {
  if (urlPending) {
    // finishing a UI-initiated close: keep unwinding, or push/replace to match where the app is now
    urlPending = null;
    commitUrl();
    return;
  }
  applyUrl(); // Back / Forward pressed by the user
}

// Bring the app in line with the address bar (deep links + Back/Forward)
async function applyUrl() {
  applyingUrl = true;
  try {
    const p = new URLSearchParams(location.search);
    const challenge = p.get("challenge");
    if (challenge && !S.quiz) { applyChallenge(challenge); return; }

    const game = p.get("game");
    const seed = p.get("seed");
    if (game && seed && !S.quiz) {
      S.arcadeMode = game;
      S.quizRegion = p.get("region") || "World";
      S.quizDiff = p.get("diff") || "N";
      setMode("quiz");
      S.pendingChallenge = {
        type: game,
        region: S.quizRegion,
        diff: S.quizDiff,
        seed: parseInt(seed, 10),
      };
      startQuiz();
      return;
    }

    const tourId = p.get("tour");
    if (tourId) {
      startStoryTour(tourId);
      if (p.get("stop") && S.activeTour) {
        S.activeTour.stopIndex = parseInt(p.get("stop"), 10) || 0;
        renderActiveTourStop();
      }
      return;
    }

    const mode = ["explore", "atlas", "earth", "quiz"].includes(p.get("mode")) ? p.get("mode") : "explore";
    if (mode !== S.mode) setMode(mode);
    if (mode === "quiz") {
      if (!S.quiz && $("#quizResult").classList.contains("hidden")) $("#quizSetup").classList.remove("hidden");
      return;
    }
    if (mode === "atlas") {
      const metric = ATLAS_SCALES[p.get("metric")] ? p.get("metric") : "population";
      if (metric !== S.atlasMetric) await setAtlasMetric(metric);
    }

    const statesOf = S.byCca3.get(p.get("states"));
    if (statesOf) {
      if (S.stateView?.country !== statesOf) { exitStateView(false); await enterStateView(statesOf); }
      if (!p.get("state") && S.info?.type === "state") closePanel();
      return;
    }
    if (S.stateView) exitStateView();

    const country = S.byCca3.get(p.get("country")) || S.byCca3.get(p.get("c"));
    const rival = S.byCca3.get(p.get("compare"));
    const wonder = p.get("wonder");
    if (country) {
      if (S.selected !== country || !panelVisible() || S.info) selectCountry(country);
      if (rival && rival !== country) { if (S.compare?.b !== rival) setCompare(country, rival); }
      else if (S.compare || S.comparePick) endCompare();
    } else if (wonder) {
      if (!(S.info?.type === "feature" && S.info.title === wonder)) {
        const l = await findPhysical(wonder);
        if (l) openPhysical(l);
      }
    } else if (p.get("ideas") && S.mode === "earth") {
      if (S.info?.type !== "ideas") openBigIdeas();
    } else if (panelVisible()) {
      closePanel();
    }
  } finally {
    applyingUrl = false;
    const st = history.state || {};
    history.replaceState({ gvLevel: urlLevel(), gvDepth: st.gvDepth ?? 0 }, "", buildUrl());
  }
}

/* ───────────────────────── PERFORMANCE GUARDRAILS ───────────────────────── */
// Stop rendering while nobody can see the globe: background tab, or a full-screen quiz modal.
function updateRenderLoop() {
  const covered = !$("#quizSetup").classList.contains("hidden") || !$("#quizResult").classList.contains("hidden");
  const pause = document.hidden || covered;
  if (pause === S.paused) return;
  S.paused = pause;
  if (pause) S.globe.pauseAnimation();
  else S.globe.resumeAnimation();
}

function initRenderGuards() {
  const obs = new MutationObserver(updateRenderLoop);
  ["#quizSetup", "#quizResult"].forEach((s) => obs.observe($(s), { attributes: true, attributeFilter: ["class"] }));
  document.addEventListener("visibilitychange", updateRenderLoop);
}

/* ───────────────────────── KEYBOARD ───────────────────────── */
function handleEscape() {
  if (!$("#creditsModal").classList.contains("hidden")) return closeCredits();
  if (!$("#toursModal")?.classList.contains("hidden")) return closeStoryToursModal();
  if (S.activeTour) return exitStoryTour();
  if (!$("#progressPop").classList.contains("hidden")) return closeProgressPop();
  if (!$("#quizSetup").classList.contains("hidden") || !$("#quizResult").classList.contains("hidden")) return setMode("explore");
  if (S.quiz) return endQuiz();
  if (S.lifePin) return clearLifePin();
  if (S.comparePick) { const a = S.selected; clearCompare(); if (a) openPanel(a); return; }
  if (S.compare) return endCompare();
  if (panelVisible()) return closePanel();
  if (S.stateView) return exitStateView();
}

function onKey(e) {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "k") {
    e.preventDefault();
    $("#palette").classList.contains("hidden") ? openPalette() : closePalette();
    return;
  }
  if (!$("#palette").classList.contains("hidden")) return; // the palette input owns its keys
  if (isTyping()) { if (e.key === "Escape") document.activeElement.blur(); return; }
  if (mod || e.altKey) return;
  if (e.key === "/") { e.preventDefault(); openPalette(); return; }
  if (e.key === "Escape") { handleEscape(); return; }

  // Quiz: 1–9 / 0 or A–D pick an answer
  if (S.quiz && !S.quiz.locked && !$("#quizHud").classList.contains("hidden")) {
    const opts = $$("#quizOptions:not(.hidden) .q-opt");
    let i = -1;
    if (/^[1-9]$/.test(e.key)) i = +e.key - 1;
    else if (e.key === "0") i = 9;
    else if (/^[a-d]$/i.test(e.key)) i = e.key.toLowerCase().charCodeAt(0) - 97;
    if (i >= 0 && opts[i]) { e.preventDefault(); opts[i].click(); return; }
  }

  // Drawer: ← / → switch tabs
  if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && panelVisible() && S.selected && !S.compare && !S.comparePick
      && $("#panelTabs").style.display !== "none") {
    const tabs = $$(".ptab");
    if (!tabs.length) return;
    const cur = Math.max(0, tabs.findIndex((t) => t.dataset.tab === S.panelTab));
    const next = tabs[(cur + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    e.preventDefault();
    next.click();
    next.focus();
  }
}

/* ───────────────────────── WIRE UP ───────────────────────── */
function initUI() {
  $$(".mode-tab").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("#styleToggle")?.addEventListener("click", () => {
    setMapStyle(S.mapStyle === "terrain" ? "political" : "terrain");
    toast(S.mapStyle === "terrain" ? "⛰️ Terrain view — forests, deserts, ice and mountains" : "🗺️ Political map");
  });
  $("#soundToggle")?.addEventListener("click", () => setSound(!S.sound));
  const brand = $(".brand");
  if (brand) {
    Object.assign(brand, { tabIndex: 0, title: "About GeoVerse & credits" });
    brand.setAttribute("role", "button");
    brand.setAttribute("aria-label", "About GeoVerse and credits");
    brand.addEventListener("click", openCredits);
    brand.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCredits(); } });
  }
  $("#creditsClose").addEventListener("click", closeCredits);
  $("#creditsModal").addEventListener("click", (e) => { if (e.target.id === "creditsModal") closeCredits(); });
  $("#namesToggle")?.addEventListener("click", () => {
    setNames(!S.names);
    toast(S.names ? "🏷️ Country names on" : "🏷️ Country names hidden");
  });
  $("#pinToggle").addEventListener("click", () => {
    setPins(!S.pins);
    toast(S.pins ? "📍 Pins on — tiny nations & islands are easy to tap" : "📍 Pins hidden");
  });

  // Story Tours HUD & Modal buttons
  $("#toursTabBtn")?.addEventListener("click", openStoryToursModal);
  $("#toursClose")?.addEventListener("click", closeStoryToursModal);
  $("#tourExitBtn")?.addEventListener("click", exitStoryTour);
  $("#tourMinBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const card = $("#tourActiveHud .tour-hud-card");
    if (!card) return;
    const isCollapsed = card.classList.toggle("collapsed");
    $("#tourMinBtn").title = isCollapsed ? "Expand story card" : "Minimize story card";
    if (S.activeTour) {
      const s = S.activeTour.tour.stops[S.activeTour.stopIndex];
      if (s) S.globe.pointOfView(viewFor(s.lat, s.lng, s.alt * stageZoom()), 600);
    }
  });
  $("#tourActiveHud .tour-hud-top")?.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    const card = $("#tourActiveHud .tour-hud-card");
    if (card && card.classList.contains("collapsed")) {
      card.classList.remove("collapsed");
      if (S.activeTour) {
        const s = S.activeTour.tour.stops[S.activeTour.stopIndex];
        if (s) S.globe.pointOfView(viewFor(s.lat, s.lng, s.alt * stageZoom()), 600);
      }
    }
  });

  $("#quizMinBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const card = $("#quizHud .quiz-card.hud");
    if (!card) return;
    const isCollapsed = card.classList.toggle("collapsed");
    $("#quizMinBtn").title = isCollapsed ? "Expand arcade HUD" : "Minimize arcade HUD";
  });
  $("#quizHud .quiz-card.hud")?.addEventListener("click", (e) => {
    if (e.target.closest("button") || e.target.closest(".q-opt")) return;
    const card = $("#quizHud .quiz-card.hud");
    if (card && card.classList.contains("collapsed")) {
      card.classList.remove("collapsed");
    }
  });

  $("#tourPrevBtn")?.addEventListener("click", () => {
    if (S.activeTour && S.activeTour.stopIndex > 0) {
      S.activeTour.stopIndex--;
      renderActiveTourStop();
    }
  });
  $("#tourNextBtn")?.addEventListener("click", () => {
    if (!S.activeTour) return;
    if (S.activeTour.stopIndex < S.activeTour.tour.stops.length - 1) {
      S.activeTour.stopIndex++;
      renderActiveTourStop();
    } else {
      S.toursCompleted.add(S.activeTour.tour.id);
      store.set("gv-tours-completed", Array.from(S.toursCompleted));
      confetti({ particleCount: 120, spread: 85, origin: { y: 0.5 } });
      toast("🏆 Expedition completed! Beautifully explored.");
      exitStoryTour();
    }
  });
  $("#tourExploreBtn")?.addEventListener("click", () => {
    if (!S.activeTour) return;
    const s = S.activeTour.tour.stops[S.activeTour.stopIndex];
    if (!s) return;
    exitStoryTour();
    findPhysical(s.name).then((l) => {
      if (l) openPhysical(l);
      else {
        const country = Array.from(S.byName.values()).find((c) => nameOf(c) === s.country);
        if (country) selectCountry(country);
      }
    });
  });

  // 4-Mode Arcade Grid Cards
  $$("#arcadeModeGrid .arcade-card").forEach((card) => {
    card.addEventListener("click", () => setArcadeMode(card.dataset.arcade));
  });

  $("#progressChip").addEventListener("click", (e) => { e.stopPropagation(); toggleProgressPop(); });
  document.addEventListener("click", (e) => {
    const pop = $("#progressPop");
    if (!pop.classList.contains("hidden") && !pop.contains(e.target) && !$("#progressChip").contains(e.target)) closeProgressPop();
  });

  // quiz setup
  const onPick = () => { updateQuizBestLabels(); dropChallengeIfChanged(); };
  $$("#quizTypeSeg .seg-btn").forEach((b) => b.addEventListener("click", () => {
    S.quizType = b.dataset.qtype;
    $$("#quizTypeSeg .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
    onPick();
  }));
  $$("#quizRegionSeg .seg-btn").forEach((b) => b.addEventListener("click", () => {
    S.quizRegion = b.dataset.region;
    $$("#quizRegionSeg .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
    onPick();
  }));
  $$("#quizDiffSeg .seg-btn").forEach((b) => b.addEventListener("click", () => {
    S.quizDiff = b.dataset.diff;
    $$("#quizDiffSeg .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
    onPick();
  }));
  $("#quizStart").addEventListener("click", startQuiz);
  $("#quizSkip").addEventListener("click", skipRound);
  $("#quizQuit").addEventListener("click", () => endQuiz());
  $("#quizSetupClose").addEventListener("click", () => setMode("explore"));
  $("#quizResultClose").addEventListener("click", () => setMode("explore"));
  // clicking the dark backdrop (outside the card) also leaves
  $("#quizSetup").addEventListener("click", (e) => { if (e.target.id === "quizSetup") setMode("explore"); });
  $("#quizResult").addEventListener("click", (e) => { if (e.target.id === "quizResult") setMode("explore"); });
  $("#resultAgain").addEventListener("click", () => {
    $("#quizResult").classList.add("hidden");
    $("#quizSetup").classList.remove("hidden");
    updateQuizBestLabels();
  });
  $("#resultExplore").addEventListener("click", () => setMode("explore"));
  $("#resultChallenge").addEventListener("click", shareChallenge);
  $("#resultShare").addEventListener("click", shareScorecard);

  // atlas & earth docks
  $$(".metric-btn[data-metric]").forEach((b) => b.addEventListener("click", () => setAtlasMetric(b.dataset.metric)));
  $("#atlas3d").addEventListener("change", (e) => { S.atlas3d = e.target.checked; refreshPolys(); });
  $$(".layer-btn").forEach((b) => b.addEventListener("click", () => {
    const key = b.dataset.layer;
    S.earthLayers[key] = !S.earthLayers[key];
    b.classList.toggle("on", S.earthLayers[key]);
    b.setAttribute("aria-pressed", String(S.earthLayers[key]));
    applyEarthLayers();
  }));
  $$(".layer-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.classList.contains("on"))));
  $("#bigIdeasBtn").addEventListener("click", openBigIdeas);

  // drawer
  $("#panelClose").addEventListener("click", closePanel);
  $("#panelCompare").addEventListener("click", startComparePick);
  $$(".ptab").forEach((b) => b.addEventListener("click", () => {
    if (!S.selected) return;
    S.panelTab = b.dataset.tab;
    syncTabs();
    markVisited(S.selected); // reading a tab counts as exploring
    renderPanelTab(S.selected);
  }));

  $("#stateBack").addEventListener("click", () => exitStateView());

  document.addEventListener("keydown", onKey);
  addEventListener("popstate", onPopState);

  initSearch();
}

/* ───────────────────────── BOOT ───────────────────────── */
(async function boot() {
  try {
    await Promise.all([loadData(), window.GV_LIBS]);
    document.body.dataset.mode = S.mode;
    initGlobe();
    initMicroStates();
    initUI();
    initSheets();
    initRenderGuards();
    setPins(S.pins);
    setNames(S.names);
    setMapStyle(S.mapStyle);
    setSound(S.sound, true);
    initHint();
    updateProgress();
    renderAtlasReadout(null);
    loaderStep(100, "Ready for lift-off 🚀");

    // pre-warm the states list (~1 MB) only on desktop, once the browser is idle
    if (!isMobile() && !navigator.connection?.saveData) {
      setTimeout(() => (window.requestIdleCallback || setTimeout)(() => getStatesDataset()), 8000);
    }

    const deepLink = location.search.length > 1;
    // two frames: the globe has been drawn behind the loader, so it fades onto a finished picture
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $("#loader").classList.add("done");
      // touch screens don't show the bottom hint — teach the three gestures once, on the first visit
      if (isCoarse() && !store.get("gv-coached", false)) {
        store.set("gv-coached", true);
        setTimeout(() => toast("👆 Drag to spin · pinch to zoom · tap any country", 5200), 1600);
      }
      if (!deepLink) S.globe.pointOfView({ lat: 18, lng: 30, altitude: 2.4 }, 2400);
      S.urlReady = true;
      if (deepLink) applyUrl();
      else history.replaceState({ gvLevel: 0, gvDepth: history.state?.gvDepth ?? 0 }, "", location.href);
    }));
  } catch (err) {
    console.error(err);
    loaderStep(100, String(err?.message).includes("WEBGL_UNAVAILABLE")
      ? "⚠️ This browser can't draw 3D right now (WebGL is off or unsupported). Try another browser, or turn on hardware acceleration."
      : "⚠️ Couldn't reach map data — check your internet connection and refresh.");
  }
})();
