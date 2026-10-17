/* ═══════════════════════════════════════════════════════════
   GEOVERSE ENGINE v2 — a lean three.js globe
   · all land is ONE mesh; per-country colour lives in a tiny lookup texture
     (hover, selection, choropleths = rewriting a few bytes, never rebuilding geometry)
   · picking: ray → sphere → lat/lng → grid + point-in-polygon (no triangle raycasts)
   · one camera director (flights cancel each other), steering that slows as you zoom in
   · renders only when something changes; 30 fps when idle; resolution adapts to the device
   Exposes window.GeoEngine.create(container, opts) → a globe.gl-compatible facade, so the
   existing app runs on it unchanged while modes are moved over stage by stage.
   ═══════════════════════════════════════════════════════════ */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

const RAD = Math.PI / 180;
const MAX_IDS = 512; // colour-texture slots (241 countries + Antarctica fit comfortably)
const MAX_H = 0.4;   // tallest 3D bar, in globe radii

// Clean "political" palette — soft pastels that read well on a blue ocean
const PALETTE = ["#f2d48f", "#a9d39e", "#f3b59a", "#b9c6ec", "#d9b8e3", "#9fd6cf"];
const ICE = "#e9f1f7";

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function create(container, { countries, extraLand = [], neighbors = [], priority = () => 0, liftOf = () => 0 }) {
  const G = globalThis.GeoCore;
  const isPhone = matchMedia("(max-width: 768px)").matches || matchMedia("(pointer: coarse)").matches;
  const lowMem = navigator.deviceMemory && navigator.deviceMemory <= 2;

  /* ── renderer, scene, camera ── */
  const renderer = new THREE.WebGLRenderer({ antialias: !lowMem, powerPreference: "high-performance" });
  const maxDpr = () => Math.min(devicePixelRatio || 1, isPhone ? 2 : 2);
  renderer.setPixelRatio(maxDpr());
  renderer.setClearColor(0x070b14, 1);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.02, 60); // near/far kept tight → no border flicker when zoomed out
  camera.position.copy(vec(25, 12, 4.5 + 1));

  /* ── ocean ── */
  const lightDir = new THREE.Vector3(0, 0, 1);
  const ocean = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { uLight: { value: lightDir }, uDeep: { value: new THREE.Color("#174a75") }, uRim: { value: new THREE.Color("#3b8cc4") } },
      vertexShader: `varying vec3 vN; varying vec3 vW;
        void main(){ vN = normalize(position); vW = (modelMatrix*vec4(position,1.)).xyz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform vec3 uLight, uDeep, uRim; varying vec3 vN; varying vec3 vW;
        void main(){ vec3 v = normalize(cameraPosition - vW); float f = 1. - max(dot(vN, v), 0.);
          vec3 c = mix(uDeep, uRim, pow(f, 2.2));
          float l = .78 + .22*max(dot(vN, uLight), 0.);
          gl_FragColor = vec4(c*l, 1.);
          #include <colorspace_fragment>
        }`,
    })
  );
  scene.add(ocean);

  /* ── land: one mesh for the whole world ── */
  const all = [...countries, ...extraLand];
  const idMap = new Map(countries.map((f, i) => [f, i + 1]));
  const land = G.buildLand(all, {
    idOf: (f) => idMap.get(f) || 0,
    radiusOf: (f) => 1.001 + (liftOf(f) || 0),
  });
  const landGeo = new THREE.BufferGeometry();
  landGeo.setAttribute("position", new THREE.BufferAttribute(land.positions, 3));
  landGeo.setAttribute("aId", new THREE.BufferAttribute(land.ids, 1));
  landGeo.setIndex(new THREE.BufferAttribute(land.index, 1));
  landGeo.computeBoundingSphere();

  const colourBytes = new Uint8Array(MAX_IDS * 4);
  const colourTex = new THREE.DataTexture(colourBytes, MAX_IDS, 1, THREE.RGBAFormat);
  colourTex.magFilter = colourTex.minFilter = THREE.NearestFilter;
  colourTex.colorSpace = THREE.SRGBColorSpace;
  // per-country bar height (3D data view), 0..MAX_H, also a tiny lookup texture
  const heightBytes = new Uint8Array(MAX_IDS * 4);
  const heightTex = new THREE.DataTexture(heightBytes, MAX_IDS, 1, THREE.RGBAFormat);
  heightTex.magFilter = heightTex.minFilter = THREE.NearestFilter;
  heightTex.needsUpdate = true;
  const uExtrude = { value: 0 };
  const LOOKUP = (v) => `texture2D(${v}, vec2((floor(aId + .5) + .5) / ${MAX_IDS}.0, .5))`;
  function makeLandMat(tex, extrude) {
    return new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uColours: { value: tex }, uLight: { value: lightDir }, uHeights: { value: heightTex }, uExtrude: extrude },
      vertexShader: `attribute float aId; uniform sampler2D uHeights; uniform float uExtrude;
        varying float vId; varying vec3 vN; varying vec3 vW;
        void main(){ vId = aId; vN = normalize(position);
          float h = uExtrude * ${LOOKUP("uHeights")}.r * ${MAX_H.toFixed(3)};
          vec3 p = vN * (length(position) + h);
          vW = (modelMatrix*vec4(p,1.)).xyz;
          gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
      fragmentShader: `uniform sampler2D uColours; uniform vec3 uLight; varying float vId; varying vec3 vN; varying vec3 vW;
        void main(){ vec3 c = texture2D(uColours, vec2((floor(vId + .5) + .5) / ${MAX_IDS}.0, .5)).rgb;
          vec3 v = normalize(cameraPosition - vW);
          float l = .74 + .26*max(dot(vN, uLight), 0.);
          float rim = .88 + .12*max(dot(vN, v), 0.);
          gl_FragColor = vec4(c*l*rim, 1.);
          #include <colorspace_fragment>
        }`,
    });
  }
  const landMat = makeLandMat(colourTex, uExtrude);
  const landMesh = new THREE.Mesh(landGeo, landMat);
  scene.add(landMesh);

  // base colours: political palette (neighbours always differ), ice for Antarctica
  const slot = G.colourCountries(countries, neighbors, PALETTE.length);
  const srgb = (hex) => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace); // raw sRGB numbers, no conversion
  const base = countries.map((_, i) => srgb(PALETTE[slot[i]]));
  const ice = srgb(ICE);

  /* ── lines: borders/coasts, graticule, selection outline ── */
  const lineMats = [];
  function fatLines(positions, { color, width, opacity }) {
    const geo = new LineSegmentsGeometry().setPositions(positions);
    const mat = new LineMaterial({ color, linewidth: width, transparent: true, opacity, depthWrite: false });
    lineMats.push(mat);
    return new LineSegments2(geo, mat);
  }
  const borders = fatLines(G.buildLines(all, { r: 1.0016 }), { color: 0x24384f, width: 0.9, opacity: 0.55 });
  scene.add(borders);

  const grat = [];
  for (let lng = -180; lng < 180; lng += 15) grat.push({ geometry: { type: "LineString", coordinates: Array.from({ length: 61 }, (_, i) => [lng, -90 + i * 3]) } });
  for (let lat = -75; lat <= 75; lat += 15) grat.push({ geometry: { type: "LineString", coordinates: Array.from({ length: 121 }, (_, i) => [-180 + i * 3, lat]) } });
  const gratPos = [];
  for (const g of grat) {
    const c = g.geometry.coordinates;
    for (let i = 0; i < c.length - 1; i++) gratPos.push(...vecArr(c[i][0], c[i][1], 1.0004), ...vecArr(c[i + 1][0], c[i + 1][1], 1.0004));
  }
  const graticule = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(gratPos, 3)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false })
  );
  scene.add(graticule);

  let outline = null, outlined = null;
  function outlineCountry(f) {
    if (f === outlined) return;
    outlined = f;
    if (outline) { scene.remove(outline); outline.geometry.dispose(); lineMats.splice(lineMats.indexOf(outline.material), 1); outline.material.dispose(); outline = null; }
    if (f) {
      outline = fatLines(G.buildLines([f], { r: 1.0022 + (liftOf(f) || 0) }), { color: 0xffffff, width: 2.4, opacity: 0.95 });
      outline.userData.r = 1.0022 + (liftOf(f) || 0);
      outline.material.resolution.set(innerWidth, innerHeight);
      scene.add(outline);
    }
    dirty = true;
  }

  /* ── 3D bars: side walls (built the first time 3D is switched on) + animated heights ── */
  let walls = null, extrudeOn = false;
  const hTarget = new Float32Array(MAX_IDS), hCur = new Float32Array(MAX_IDS);
  function ensureWalls() {
    if (walls) return;
    const w = G.buildWalls(countries, { idOf: (f) => idMap.get(f), r: 1.0005 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(w.positions, 3));
    geo.setAttribute("aId", new THREE.BufferAttribute(w.ids, 1));
    geo.setAttribute("aTop", new THREE.BufferAttribute(w.top, 1));
    geo.setAttribute("aN", new THREE.BufferAttribute(w.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(w.index, 1));
    walls = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uColours: { value: colourTex }, uHeights: { value: heightTex }, uExtrude, uLight: { value: lightDir } },
      vertexShader: `attribute float aId; attribute float aTop; attribute vec3 aN; uniform sampler2D uHeights; uniform float uExtrude;
        varying float vId; varying vec3 vNw;
        void main(){ vId = aId; vNw = aN;
          float h = uExtrude * ${LOOKUP("uHeights")}.r * ${MAX_H.toFixed(3)};
          vec3 p = normalize(position) * (length(position) + aTop * h);
          gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
      fragmentShader: `uniform sampler2D uColours; uniform vec3 uLight; varying float vId; varying vec3 vNw;
        void main(){ vec3 c = texture2D(uColours, vec2((floor(vId + .5) + .5) / ${MAX_IDS}.0, .5)).rgb;
          float l = .52 + .34*abs(dot(normalize(vNw), uLight)); // sides a shade darker than the tops
          gl_FragColor = vec4(c*l, 1.);
          #include <colorspace_fragment>
        }`,
    }));
    walls.visible = false;
    scene.add(walls);
  }
  // targets from the app's polygonAltitude (globe.gl units; ~0.007 is "flat")
  function retarget() {
    const fn = acc.polygonAltitude;
    for (let i = 0; i < countries.length; i++) {
      const v = extrudeOn && typeof fn === "function" ? +fn(countries[i]) || 0 : 0;
      hTarget[i + 1] = Math.max(0, Math.min(MAX_H, v - 0.007));
    }
    dirty = true;
  }
  // bars glide to their new heights; returns true while anything is still moving
  function stepHeights(dt) {
    const k = 1 - Math.pow(1 - 0.14, dt * 60);
    let moving = false, any = false, changed = false;
    for (let i = 1; i <= countries.length; i++) {
      const d = hTarget[i] - hCur[i];
      if (Math.abs(d) > 2e-4) { hCur[i] += d * k; moving = true; } else hCur[i] = hTarget[i];
      if (hCur[i] > 1e-4) any = true;
      const b = Math.round((hCur[i] / MAX_H) * 255);
      if (heightBytes[i * 4] !== b) { heightBytes[i * 4] = b; changed = true; }
    }
    if (changed) heightTex.needsUpdate = true;
    uExtrude.value = any ? 1 : 0;
    if (walls) walls.visible = any;
    return moving;
  }
  const maxHeight = () => { let m = 0; for (let i = 1; i <= countries.length; i++) m = Math.max(m, hCur[i]); return m * uExtrude.value; };

  /* ── states / provinces of one country: their own mesh, outlines, picker and colours ── */
  let states = null;
  const STATE_BASE = new THREE.Color().setStyle("#f6efe2", THREE.LinearSRGBColorSpace);
  function setStates(list) {
    if (states && states.list.length === list.length && states.list[0] === list[0]) return; // same set
    if (states) {
      scene.remove(states.mesh, states.lines);
      states.mesh.geometry.dispose(); states.mesh.material.dispose(); states.tex.dispose();
      lineMats.splice(lineMats.indexOf(states.lines.material), 1); states.lines.geometry.dispose(); states.lines.material.dispose();
      states = null;
    }
    if (list.length) {
      const st = G.buildLand(list, { idOf: (f, i) => i + 1, radiusOf: () => 1.0028 });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(st.positions, 3));
      geo.setAttribute("aId", new THREE.BufferAttribute(st.ids, 1));
      geo.setIndex(new THREE.BufferAttribute(st.index, 1));
      const bytes = new Uint8Array(MAX_IDS * 4);
      const tex = new THREE.DataTexture(bytes, MAX_IDS, 1, THREE.RGBAFormat);
      tex.magFilter = tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(geo, makeLandMat(tex, { value: 0 }));
      const lines = fatLines(G.buildLines(list, { r: 1.0031 }), { color: 0xfff7e6, width: 1.3, opacity: 0.95 });
      lines.material.resolution.set(cssW, cssH);
      scene.add(mesh, lines);
      states = { list, mesh, lines, bytes, tex, pick: G.makePicker(list), index: new Map(list.map((f, i) => [f, i + 1])) };
    }
    recolour();
  }

  /* ── atmosphere + stars ── */
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(1.14, 64, 48),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color("#5fb8ff") } },
      vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform vec3 uColor; varying vec3 vN; void main(){ float i = pow(max(0., .72 + dot(vN, vec3(0,0,1.))), 3.2); gl_FragColor = vec4(uColor, 1.)*i*.9;
        #include <colorspace_fragment>
      }`,
    })
  ));
  {
    const n = 1600, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      p.set([40 * s * Math.cos(t), 40 * u, 40 * s * Math.sin(t)], i * 3);
    }
    scene.add(new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(p, 3)),
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false })
    ));
  }

  /* ── steering ── */
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, {
    enableDamping: true, dampingFactor: 0.08, enablePan: false,
    minDistance: 1.06, maxDistance: 6.5, rotateSpeed: 1, zoomSpeed: 0.9,
    minPolarAngle: 0.05, maxPolarAngle: Math.PI - 0.05,
  });

  // wheel zoom glides in "height above the surface", so every notch feels the same at any altitude
  let zoomTo = null;
  container.addEventListener("wheel", (e) => {
    e.preventDefault();
    e.stopPropagation(); // keep OrbitControls' jumpy dolly out of it (pinch still uses it)
    cancelFlight();
    const h = zoomTo ?? camera.position.length() - 1;
    const k = Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016))));
    zoomTo = Math.max(controls.minDistance - 1, Math.min(controls.maxDistance - 1, h * k));
    lastInput = performance.now();
  }, { passive: false, capture: true });

  /* ── camera director: exactly one flight at a time ── */
  let flight = null;
  function cancelFlight() { flight = null; }
  controls.addEventListener("start", () => { cancelFlight(); zoomTo = null; lastInput = performance.now(); });
  controls.addEventListener("change", () => { dirty = true; });

  // Leftover spin momentum (damping after a drag or auto-rotate) must not nudge the camera after a
  // programmatic move lands: apply what's left right now, before the move starts.
  function flushMomentum() {
    const damp = controls.enableDamping, auto = controls.autoRotate;
    controls.enableDamping = false; controls.autoRotate = false;
    controls.update();
    controls.enableDamping = damp; controls.autoRotate = auto;
  }

  function pointOfView(pov, ms = 0) {
    if (!pov) {
      const [lng, lat] = G.toLngLat(camera.position.toArray());
      return { lat, lng, altitude: camera.position.length() - 1 };
    }
    zoomTo = null;
    flushMomentum();
    const cur = pointOfView();
    const target = { lat: pov.lat ?? cur.lat, lng: pov.lng ?? cur.lng, altitude: pov.altitude ?? cur.altitude };
    target.lat = Math.max(-85, Math.min(85, target.lat));
    if (!ms) { flight = null; placeCamera(target.lat, target.lng, target.altitude); dirty = true; return api; }
    const a = vec(cur.lng, cur.lat, 1).normalize(), b = vec(target.lng, target.lat, 1).normalize();
    const span = a.angleTo(b); // radians travelled over the surface
    // long hops rise above the planet mid-flight, then settle — no separate "rise" and "dive" moves to fight
    const hump = Math.min(1.4, Math.max(0, span / Math.PI * 1.6 - Math.min(cur.altitude, target.altitude) * 0.15));
    flight = { a, b, span, h0: cur.altitude, h1: target.altitude, hump, t0: performance.now(), ms };
    return api;
  }

  function placeCamera(lat, lng, alt) {
    camera.position.copy(vec(lng, lat, 1 + alt));
    camera.lookAt(0, 0, 0);
    controls.update();
  }

  const q = new THREE.Quaternion(), axis = new THREE.Vector3();
  function stepFlight(now) {
    if (!flight) return false;
    const t = Math.min(1, (now - flight.t0) / flight.ms), e = easeInOut(t);
    const dir = flight.a.clone();
    if (flight.span > 1e-6) {
      axis.crossVectors(flight.a, flight.b).normalize();
      q.setFromAxisAngle(axis, flight.span * e);
      dir.applyQuaternion(q);
    }
    const h = flight.h0 + (flight.h1 - flight.h0) * e + flight.hump * Math.sin(Math.PI * t);
    camera.position.copy(dir.multiplyScalar(1 + h));
    camera.lookAt(0, 0, 0);
    if (t >= 1) flight = null;
    return true;
  }

  /* ── picking ── */
  const pick = G.makePicker(countries, { priority });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function surfaceAt(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // analytic ray ∩ unit sphere
    const o = ray.ray.origin, d = ray.ray.direction;
    const bq = o.dot(d), c = o.lengthSq() - 1.001 * 1.001, disc = bq * bq - c;
    if (disc < 0) return null;
    const t = -bq - Math.sqrt(disc);
    if (t < 0) return null;
    const p = o.clone().addScaledVector(d, t);
    const [lng, lat] = G.toLngLat(p.toArray());
    return { lat, lng };
  }

  // states (when shown) sit on top of their country
  const pickAny = (lng, lat) => (states && states.pick(lng, lat)) || pick(lng, lat);

  // what's under the pointer: {s: lat/lng on the surface, f: country/state or null}, or null for space.
  // With 3D bars up, march down the ray so the top of a tall bar picks that bar, not what lies beneath it.
  function hitAt(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    const sphere = (R) => { const bq = o.dot(d), c = o.lengthSq() - R * R, disc = bq * bq - c; return disc < 0 ? null : [-bq - Math.sqrt(disc), -bq + Math.sqrt(disc)]; };
    const base = sphere(1.001);
    const hMax = extrudeOn ? maxHeight() : 0;
    if (hMax > 1e-3) {
      const shell = sphere(1.001 + hMax + 0.002);
      if (shell && shell[0] > 0) {
        const t0 = shell[0], t1 = base && base[0] > 0 ? base[0] : shell[1];
        const p = new THREE.Vector3();
        for (let k = 0; k <= 48; k++) {
          p.copy(o).addScaledVector(d, t0 + ((t1 - t0) * k) / 48);
          const [lng, lat] = G.toLngLat(p.toArray());
          const f = pick(lng, lat);
          const id = f ? idMap.get(f) : 0;
          if (f && p.length() - 1.001 <= hCur[id] + 0.002) return { s: { lat, lng }, f };
        }
      }
    }
    if (!base || base[0] < 0) return null;
    const p = o.clone().addScaledVector(d, base[0]);
    const [lng, lat] = G.toLngLat(p.toArray());
    return { s: { lat, lng }, f: pickAny(lng, lat) };
  }

  /* ── layers the app talks to through the facade ── */
  const handlers = {};
  const acc = {}; // stored accessors (globe.gl style)
  let hoverF = null;

  // per-country colour = palette ⊕ app overlay (capColor) ⊕ hover lift
  const parsed = new Map();
  function parseColour(s) {
    if (s == null || s === "") return null;
    let p = parsed.get(s);
    if (p === undefined) {
      const c = globalThis.d3 ? d3.color(s) : null;
      p = c ? { r: c.r / 255, g: c.g / 255, b: c.b / 255, a: c.opacity ?? 1 } : null;
      parsed.set(s, p);
    }
    return p;
  }
  const tmp = new THREE.Color();
  function recolour() {
    const capFn = acc.polygonCapColor;
    for (let i = 0; i <= countries.length; i++) {
      if (i === 0) { colourBytes.set([ice.r * 255, ice.g * 255, ice.b * 255, 255], 0); continue; }
      const f = countries[i - 1];
      tmp.copy(base[i - 1]);
      const o = capFn ? parseColour(capFn(f)) : null;
      if (o) tmp.setRGB(tmp.r + (o.r - tmp.r) * o.a, tmp.g + (o.g - tmp.g) * o.a, tmp.b + (o.b - tmp.b) * o.a);
      if (f === hoverF) tmp.lerp(WHITE, 0.28);
      colourBytes[i * 4] = tmp.r * 255; colourBytes[i * 4 + 1] = tmp.g * 255; colourBytes[i * 4 + 2] = tmp.b * 255; colourBytes[i * 4 + 3] = 255;
    }
    colourTex.needsUpdate = true;
    if (states) {
      states.list.forEach((f, i) => {
        tmp.copy(STATE_BASE);
        const o = capFn ? parseColour(capFn(f)) : null;
        if (o) tmp.setRGB(tmp.r + (o.r - tmp.r) * o.a, tmp.g + (o.g - tmp.g) * o.a, tmp.b + (o.b - tmp.b) * o.a);
        if (f === hoverF) tmp.lerp(WHITE, 0.3);
        const k = (i + 1) * 4;
        states.bytes[k] = tmp.r * 255; states.bytes[k + 1] = tmp.g * 255; states.bytes[k + 2] = tmp.b * 255; states.bytes[k + 3] = 255;
      });
      states.tex.needsUpdate = true;
    }
    dirty = true;
  }
  const WHITE = new THREE.Color(1, 1, 1);

  /* tooltip for mouse hover (polygonLabel) */
  const tip = document.createElement("div");
  tip.className = "gv-tip";
  tip.style.cssText = "position:fixed;left:0;top:0;z-index:35;pointer-events:none;display:none;will-change:transform";
  document.body.appendChild(tip);
  function showTipHtml(html, x, y, key) {
    if (!html) { hideTip(); return; }
    if (tip._k !== key || tip._h !== html) { tip.innerHTML = html; tip._k = key; tip._h = html; }
    tip.style.display = "block";
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const tx = Math.min(innerWidth - w - 8, x + 16), ty = y + h + 24 > innerHeight ? y - h - 12 : y + 18;
    tip.style.transform = `translate(${tx}px, ${ty}px)`;
  }
  function hideTip() { tip.style.display = "none"; }
  const showTip = (f, x, y) => showTipHtml(f && acc.polygonLabel ? acc.polygonLabel(f) : "", x, y, f);


  /* ── what's on the near side of the planet? (exact horizon of the unit sphere, with a soft fade) ── */
  const camDir = new THREE.Vector3(), pv = new THREE.Vector3(), pn = new THREE.Vector3();
  let horizon = 0.5;
  function beginProjection() {
    camDir.copy(camera.position).normalize();
    horizon = 1 / camera.position.length(); // a surface point is visible when p̂·ĉ > 1/|c|
  }
  // → { x, y, a } in CSS px with a 0..1 visibility (0 = behind the planet), or null
  function project(lat, lng, alt = 0) {
    pv.copy(vec(lng, lat, 1 + alt));
    pn.copy(pv).normalize();
    const vis = pn.dot(camDir) - horizon + alt * 0.9;
    if (vis <= 0) return null;
    pv.project(camera);
    return { x: ((pv.x + 1) / 2) * cssW, y: ((1 - pv.y) / 2) * cssH, a: Math.min(1, vis / 0.05) };
  }

  /* ── overlay canvas: every label and pin painted in one 2D pass (no DOM per item) ── */
  const overlay = document.createElement("canvas");
  overlay.style.cssText = "position:absolute;left:0;top:0;pointer-events:none";
  container.appendChild(overlay);
  const octx = overlay.getContext ? overlay.getContext("2d") : null;
  const fontFamily = (() => {
    try { return getComputedStyle(document.body).fontFamily || "Inter, system-ui, sans-serif"; } catch (e) { return "Inter, system-ui, sans-serif"; }
  })();
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  let labels = [], markers = [], hitItems = [], overHover = null, cssW = innerWidth, cssH = innerHeight;
  let stats = { labels: 0, markers: 0, boxes: [] }; // what the last overlay pass drew (read by tests)
  const widthCache = new Map();
  function textWidth(font, text, px) {
    const k = font + "|" + text;
    let w = widthCache.get(k);
    if (w === undefined) {
      if (octx) { octx.font = font; w = octx.measureText(text).width; } else w = text.length * px * 0.58;
      widthCache.set(k, w);
    }
    return w;
  }
  // light text gets a dark halo, dark text a light one — always readable on land or sea
  const haloFor = (rgb) => (rgb && (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) > 0.55 ? "rgba(6,14,28,0.78)" : "rgba(255,255,255,0.82)");

  function setLabels(data) {
    const size = acc.labelSize || ((l) => l.size || 1);
    labels = (data || []).slice().sort((a, b) => size(b) - size(a)); // big names claim space first
    dirty = true;
  }
  function setMarkers(data) { markers = (data || []).slice(); dirty = true; }

  function drawOverlay() {
    hitItems = [];
    if (octx) { octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, overlay.width, overlay.height); octx.setTransform(overlayDpr, 0, 0, overlayDpr, 0, 0); }
    stats = { labels: 0, markers: 0, boxes: [] };
    if (!labels.length && !markers.length) return;
    beginProjection();
    const alt = camera.position.length() - 1;
    const placed = []; // screen boxes already taken
    const collides = (b) => placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);

    // pins first (they also block labels from covering them)
    for (const m of markers) {
      const p = project(acc.markerLat ? acc.markerLat(m) : m.lat, acc.markerLng ? acc.markerLng(m) : m.lng, 0.002);
      if (!p) continue;
      const icon = acc.markerIcon ? acc.markerIcon(m) : null;
      const hot = m === overHover;
      const r = icon ? (hot ? 16 : 13) : (hot ? 6.5 : 4.5);
      if (octx) {
        octx.globalAlpha = p.a;
        if (icon) {
          octx.beginPath(); octx.arc(p.x, p.y - r, r, 0, Math.PI * 2);
          octx.fillStyle = "rgba(255,255,255,0.94)"; octx.fill();
          octx.lineWidth = 1.5; octx.strokeStyle = hot ? "#f59e0b" : "rgba(20,40,70,0.35)"; octx.stroke();
          octx.beginPath(); octx.moveTo(p.x - 4, p.y - 3); octx.lineTo(p.x, p.y + 2); octx.lineTo(p.x + 4, p.y - 3); octx.fillStyle = "rgba(255,255,255,0.94)"; octx.fill();
          octx.font = `${Math.round(r * 1.15)}px ${EMOJI_FONT}`; octx.textAlign = "center"; octx.textBaseline = "middle";
          octx.fillText(icon, p.x, p.y - r + 1);
        } else {
          octx.beginPath(); octx.arc(p.x, p.y, r + 2, 0, Math.PI * 2); octx.fillStyle = "rgba(6,14,28,0.75)"; octx.fill();
          octx.beginPath(); octx.arc(p.x, p.y, r, 0, Math.PI * 2); octx.fillStyle = hot ? "#ffffff" : "#f59e0b"; octx.fill();
        }
      }
      const cy = icon ? p.y - r : p.y;
      placed.push({ x0: p.x - r, x1: p.x + r, y0: cy - r, y1: cy + r });
      hitItems.push({ kind: "marker", d: m, x: p.x, y: cy, r });
      stats.markers++;
    }

    // labels: biggest first, skip anything that would overlap, reveal smaller names as you zoom in
    const minSize = Math.max(0.5, Math.min(1.6, 0.35 + alt * 0.45));
    const sizeOf = acc.labelSize || ((l) => l.size || 1);
    let drawn = 0;
    for (const l of labels) {
      if (drawn >= 140) break;
      const size = sizeOf(l);
      if (size < minSize) continue;
      const p = project(acc.labelLat ? acc.labelLat(l) : l.lat, acc.labelLng ? acc.labelLng(l) : l.lng, 0.001);
      if (!p || p.a < 0.15) continue;
      const text = acc.labelText ? acc.labelText(l) : l.text;
      if (!text) continue;
      const px = Math.round(9 + (Math.min(1.9, size) - 0.5) * 4.2);
      const italic = acc.labelItalic ? acc.labelItalic(l) : false;
      const font = `${italic ? "italic 500" : "600"} ${px}px ${fontFamily}`;
      const w = textWidth(font, text, px);
      const box = { x0: p.x - w / 2 - 3, x1: p.x + w / 2 + 3, y0: p.y - px / 2 - 2, y1: p.y + px / 2 + 2 };
      if (box.x1 < 0 || box.x0 > cssW || box.y1 < 0 || box.y0 > cssH || collides(box)) continue;
      placed.push(box);
      drawn++;
      stats.labels++; stats.boxes.push(box);
      if (octx) {
        const col = acc.labelColor ? acc.labelColor(l) : "#ffffff";
        octx.globalAlpha = p.a;
        octx.font = font; octx.textAlign = "center"; octx.textBaseline = "middle";
        octx.lineJoin = "round"; octx.lineWidth = 3; octx.strokeStyle = haloFor(parseColour(col));
        octx.strokeText(text, p.x, p.y);
        octx.fillStyle = col;
        octx.fillText(text, p.x, p.y);
      }
      if (!acc.labelClickable || acc.labelClickable(l)) hitItems.push({ kind: "label", d: l, box });
    }
    if (octx) octx.globalAlpha = 1;
  }

  // what's under the pointer on the overlay? (pins win, then labels); touch gets bigger targets
  function overlayHit(x, y, touch) {
    for (let i = hitItems.length - 1; i >= 0; i--) {
      const h = hitItems[i];
      if (h.kind === "marker") {
        if (Math.hypot(x - h.x, y - h.y) <= Math.max(h.r + (touch ? 10 : 4), touch ? 22 : 0)) {
          return { kind: "marker", d: h.d, country: acc.markerCountry ? acc.markerCountry(h.d) : null, html: acc.markerLabel ? acc.markerLabel(h.d) : "" };
        }
      } else if (handlers.onLabelClick) {
        const b = h.box, pad = touch ? 6 : 0;
        if (x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad) {
          return { kind: "label", d: h.d, country: null, html: acc.labelLabel ? acc.labelLabel(h.d) : "" };
        }
      }
    }
    return null;
  }
  function setOverHover(hit) {
    const d = hit ? hit.d : null;
    if (d === overHover) return;
    const prev = overHover;
    overHover = d;
    if (prev && markers.includes(prev)) handlers.onMarkerHover?.(null);
    if (prev && labels.includes(prev)) handlers.onLabelHover?.(null);
    if (hit?.kind === "marker") handlers.onMarkerHover?.(d);
    if (hit?.kind === "label") handlers.onLabelHover?.(d);
    dirty = true;
  }

  /* ── rivers: one line object for all of them, hit-tested on a 2° grid ── */
  let riverObj = null, riverGrid = null, paths = [], pathHover = null;
  function setPaths(data) {
    paths = data || [];
    if (riverObj) { scene.remove(riverObj); riverObj.geometry.dispose(); lineMats.splice(lineMats.indexOf(riverObj.material), 1); riverObj.material.dispose(); riverObj = null; }
    riverGrid = null;
    if (paths.length) {
      const ptsOf = acc.pathPoints || ((p) => p.pts || p);
      const latOf = acc.pathPointLat || ((pt) => pt[0]), lngOf = acc.pathPointLng || ((pt) => pt[1]);
      const pos = [];
      riverGrid = new Map();
      paths.forEach((p, pi) => {
        const pts = ptsOf(p);
        for (let i = 0; i < pts.length; i++) {
          const lat = latOf(pts[i]), lng = lngOf(pts[i]);
          const key = Math.floor((lat + 90) / 2) * 1000 + Math.floor((lng + 180) / 2);
          let cell = riverGrid.get(key);
          if (!cell) riverGrid.set(key, (cell = []));
          cell.push(pi, lat, lng);
          if (i) pos.push(...vecArr(lngOf(pts[i - 1]), latOf(pts[i - 1]), 1.0019), ...vecArr(lng, lat, 1.0019));
        }
      });
      const c = parseColour(acc.pathColor ? (typeof acc.pathColor === "function" ? acc.pathColor(paths[0]) : acc.pathColor) : "#6ecdff") || { r: 0.43, g: 0.8, b: 1, a: 0.7 };
      riverObj = fatLines(pos, { color: new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace), width: 1.4, opacity: Math.min(1, c.a + 0.15) });
      riverObj.material.resolution.set(cssW, cssH);
      scene.add(riverObj);
    }
    dirty = true;
  }
  // nearest river within `px` screen pixels of a surface point
  function pathAt(s, px) {
    if (!riverGrid) return null;
    const alt = camera.position.length() - 1;
    const fov = (camera.fov * Math.PI) / 180;
    const thr = ((2 * alt * Math.tan(fov / 2)) / cssH) * px / RAD; // degrees per px × px
    const r0 = Math.floor((s.lat + 90) / 2), c0 = Math.floor((s.lng + 180) / 2);
    let best = null, bestD = thr;
    for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) {
      const cell = riverGrid.get(r * 1000 + c);
      if (!cell) continue;
      for (let i = 0; i < cell.length; i += 3) {
        let dl = Math.abs(cell[i + 2] - s.lng); if (dl > 180) dl = 360 - dl;
        const dd = Math.hypot(dl * Math.cos(s.lat * RAD), cell[i + 1] - s.lat);
        if (dd < bestD) { bestD = dd; best = paths[cell[i]]; }
      }
    }
    return best;
  }
  function setPathHover(p) {
    if (p === pathHover) return;
    pathHover = p;
    handlers.onPathHover?.(p);
  }

  /* ── pointer: hover (mouse only), clicks vs drags ── */
  let down = null, lastMove = null, movePending = false, lastInput = performance.now();
  const el = renderer.domElement;
  const local = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  el.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType };
    lastInput = performance.now();
  });
  el.addEventListener("pointermove", (e) => {
    lastInput = performance.now();
    if (e.pointerType !== "mouse") return;
    lastMove = e;
    if (!movePending) { movePending = true; requestAnimationFrame(doHover); }
  });
  el.addEventListener("pointerleave", () => { setHover(null); setOverHover(null); setPathHover(null); hideTip(); });
  function doHover() {
    movePending = false;
    const e = lastMove;
    if (!e) return;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) { hideTip(); return; } // dragging
    const [x, y] = local(e);
    const hit = overlayHit(x, y, false);
    if (hit) {
      setOverHover(hit); setPathHover(null);
      setHover(hit.country || null);
      container.style.cursor = "pointer";
      showTipHtml(hit.html, e.clientX, e.clientY, hit.d);
      return;
    }
    setOverHover(null);
    const h = hitAt(e.clientX, e.clientY), s = h && h.s;
    const river = s ? pathAt(s, 7) : null;
    if (river) {
      setHover(null); setPathHover(river);
      container.style.cursor = "pointer";
      showTipHtml(acc.pathLabel ? acc.pathLabel(river) : "", e.clientX, e.clientY, river);
      return;
    }
    setPathHover(null);
    const f = h ? h.f : null;
    setHover(f);
    showTip(f, e.clientX, e.clientY);
  }
  function setHover(f) {
    if (f === hoverF) return;
    hoverF = f;
    recolour();
    handlers.onPolygonHover?.(f, hoverF);
  }
  el.addEventListener("pointerup", (e) => {
    const d = down;
    down = null;
    if (!d) return;
    const touch = d.type !== "mouse";
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > (touch ? 10 : 5) || performance.now() - d.t > 700) return; // a drag, not a click
    const [x, y] = local(e);
    const hit = overlayHit(x, y, touch);
    if (hit) {
      if (hit.kind === "marker") handlers.onMarkerClick?.(hit.d, e);
      else handlers.onLabelClick?.(hit.d, e);
      return;
    }
    const h = hitAt(e.clientX, e.clientY);
    if (!h) return; // clicked space
    const s = h.s;
    const river = handlers.onPathClick ? pathAt(s, touch ? 14 : 7) : null;
    if (river) { handlers.onPathClick(river, e); return; }
    const f = h.f;
    if (f) handlers.onPolygonClick?.(f, e, { lat: s.lat, lng: s.lng, altitude: 0 });
    else handlers.onGlobeClick?.({ lat: s.lat, lng: s.lng }, e);
  });

  /* html elements pinned to the globe (only the few rich ones: wildlife card, distance badge) */
  const htmlLayer = document.createElement("div");
  htmlLayer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
  container.appendChild(htmlLayer);
  let htmlItems = [];
  function setHtml(data) {
    const keep = new Map(htmlItems.map((it) => [it.d, it]));
    const next = [];
    for (const d of data || []) {
      let it = keep.get(d);
      if (it) keep.delete(d);
      else { const node = acc.htmlElement ? acc.htmlElement(d) : null; if (!node) continue; node.style.position = "absolute"; node.style.left = "0"; node.style.top = "0"; htmlLayer.appendChild(node); it = { d, node }; }
      next.push(it);
    }
    for (const it of keep.values()) it.node.remove();
    htmlItems = next;
    dirty = true;
  }
  function placeHtml() {
    if (!htmlItems.length) return;
    beginProjection();
    for (const it of htmlItems) {
      const d = it.d, alt = acc.htmlAltitude ? acc.htmlAltitude(d) : 0;
      const p = project(acc.htmlLat ? acc.htmlLat(d) : d.lat, acc.htmlLng ? acc.htmlLng(d) : d.lng, alt || 0);
      if (!p) { if (it.vis !== false) { it.node.style.display = "none"; it.vis = false; } continue; }
      if (it.vis === false) { it.node.style.display = ""; it.vis = true; }
      it.node.style.opacity = p.a < 1 ? String(p.a) : "";
      it.node.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
  }

  /* rings: soft expanding pulses */
  let rings = [], ringT0 = 0;
  const ringGeo = new THREE.RingGeometry(0.86, 1, 64);
  function setRings(data) {
    for (const r of rings) { scene.remove(r.mesh); r.mesh.material.dispose(); }
    rings = [];
    ringT0 = performance.now();
    for (const d of data || []) {
      for (let k = 0; k < 3; k++) {
        const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        const p = vec(acc.ringLng ? acc.ringLng(d) : d.lng, acc.ringLat ? acc.ringLat(d) : d.lat, 1.003);
        mesh.position.copy(p);
        mesh.lookAt(p.clone().multiplyScalar(2));
        scene.add(mesh);
        rings.push({ d, mesh, phase: k });
      }
    }
    dirty = true;
  }
  function stepRings(now) {
    if (!rings.length) return false;
    const maxR = (typeof acc.ringMaxRadius === "function" ? acc.ringMaxRadius() : acc.ringMaxRadius) || 4;
    const period = acc.ringRepeatPeriod || 650;
    const colFn = acc.ringColor ? acc.ringColor(rings[0].d) : null;
    for (const r of rings) {
      const t = (((now - ringT0) / (period * 1.7)) + r.phase / 3) % 1;
      const s = Math.max(1e-4, maxR * RAD * t);
      r.mesh.scale.setScalar(s);
      const css = typeof colFn === "function" ? colFn(t) : "rgba(255,209,102," + (1 - t) + ")";
      const c = parseColour(css);
      if (c) { r.mesh.material.color.setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace); r.mesh.material.opacity = c.a * 0.9; }
    }
    return true;
  }

  /* arcs: great-circle bezier lines (compare mode) */
  let arcObjs = [];
  const lin = new THREE.Color();
  function setArcs(data) {
    for (const o of arcObjs) { scene.remove(o); o.geometry.dispose(); lineMats.splice(lineMats.indexOf(o.material), 1); o.material.dispose(); }
    arcObjs = [];
    for (const d of data || []) {
      const s = vec(acc.arcStartLng(d), acc.arcStartLat(d), 1), e = vec(acc.arcEndLng(d), acc.arcEndLat(d), 1);
      const ang = s.angleTo(e), alt = (ang / 2) * (acc.arcAltitudeAutoScale ?? 0.5);
      const mid = (t) => s.clone().lerp(e, t).normalize().multiplyScalar(1 + 1.5 * alt);
      const curve = new THREE.CubicBezierCurve3(s.clone().multiplyScalar(1.002), mid(0.25), mid(0.75), e.clone().multiplyScalar(1.002));
      const pts = curve.getPoints(96), pos = [], col = [];
      const [c0, c1] = (acc.arcColor ? acc.arcColor(d) : ["#ffd166", "#7ee0ff"]).map((x) => parseColour(x) || { r: 1, g: 1, b: 1, a: 1 });
      for (let i = 0; i < pts.length - 1; i++) {
        pos.push(...pts[i].toArray(), ...pts[i + 1].toArray());
        for (const t of [i / (pts.length - 1), (i + 1) / (pts.length - 1)]) {
          lin.setRGB(c0.r + (c1.r - c0.r) * t, c0.g + (c1.g - c0.g) * t, c0.b + (c1.b - c0.b) * t, THREE.SRGBColorSpace);
          col.push(lin.r, lin.g, lin.b);
        }
      }
      const geo = new LineSegmentsGeometry().setPositions(pos);
      geo.setColors(col);
      const stroke = acc.arcStroke ? acc.arcStroke(d) : 0.5;
      const mat = new LineMaterial({ vertexColors: true, linewidth: Math.max(1.5, stroke * 4.5), transparent: true, opacity: Math.min(1, c0.a + 0.05), depthWrite: false });
      mat.resolution.set(cssW, cssH);
      lineMats.push(mat);
      const obj = new LineSegments2(geo, mat);
      // dashes that travel from A to B (globe.gl's arcDash* accessors, lengths relative to the arc)
      const animMs = acc.arcDashAnimateTime ? acc.arcDashAnimateTime(d) : 0;
      if (animMs > 0) {
        const L = curve.getLength();
        mat.dashed = true;
        mat.defines.USE_DASH = "";
        mat.dashScale = 1;
        mat.dashSize = L * (acc.arcDashLength ? acc.arcDashLength(d) : 0.4);
        mat.gapSize = L * (acc.arcDashGap ? acc.arcDashGap(d) : 0.2);
        mat.needsUpdate = true;
        obj.computeLineDistances();
        obj.userData.speed = L / (animMs / 1000);
      }
      scene.add(obj);
      arcObjs.push(obj);
    }
    dirty = true;
  }

  /* ── frame loop: render on demand, 30 fps when idle, adaptive resolution ── */
  let dirty = true, paused = false, last = performance.now(), frameAvg = 1 / 60, dprTimer = 0, raf = 0;
  const overlayDpr = Math.min(devicePixelRatio || 1, 2);
  function resize() {
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + "px";
    renderer.domElement.style.height = h + "px";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    cssW = w; cssH = h;
    overlay.width = Math.round(w * overlayDpr); overlay.height = Math.round(h * overlayDpr);
    overlay.style.width = w + "px"; overlay.style.height = h + "px";
    for (const m of lineMats) m.resolution.set(w, h);
    dirty = true;
  }
  addEventListener("resize", resize);
  resize();

  function adaptResolution(dt) {
    frameAvg += (dt - frameAvg) * 0.05;
    dprTimer += dt;
    if (dprTimer < 1.5) return;
    dprTimer = 0;
    const dpr = renderer.getPixelRatio();
    if (frameAvg > 1 / 40 && dpr > 0.75) { renderer.setPixelRatio(Math.max(0.75, dpr - 0.25)); resize(); }
    else if (frameAvg < 1 / 55 && dpr < maxDpr()) { renderer.setPixelRatio(Math.min(maxDpr(), dpr + 0.25)); resize(); }
  }

  const camRight = new THREE.Vector3();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (paused) return;
    const idle = now - lastInput > 2500 && !flight && zoomTo == null;
    if (now - last < (idle ? 1000 / 30 : 1000 / 60) - 3) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    let moving = stepFlight(now);
    if (zoomTo != null) {
      const h = camera.position.length() - 1, nh = h + (zoomTo - h) * (1 - Math.pow(1 - 0.18, dt * 60));
      camera.position.setLength(1 + nh);
      if (Math.abs(zoomTo - nh) < 1e-4) zoomTo = null;
      moving = true;
    }
    // spin slows as you get closer, so the ground keeps pace with your finger
    controls.rotateSpeed = Math.max(0.04, Math.min(1, (camera.position.length() - 1) * 0.45));
    if (!flight) moving = controls.update() || moving;
    const ringsOn = stepRings(now);
    const barsOn = stepHeights(dt);
    if (outline) {
      const id = idMap.get(outlined) || 0, r0 = outline.userData.r;
      outline.scale.setScalar((r0 + hCur[id] * uExtrude.value) / r0);
    }
    let arcsOn = false;
    for (const o of arcObjs) if (o.userData.speed) { o.material.dashOffset -= o.userData.speed * dt; arcsOn = true; }

    if (!(dirty || moving || ringsOn || arcsOn || barsOn || controls.autoRotate)) return;
    dirty = false;
    // soft key light just above-left of the viewer, so the visible face is always nicely lit
    camRight.crossVectors(camera.up, camera.position).normalize();
    lightDir.copy(camera.position).normalize().addScaledVector(camera.up, 0.55).addScaledVector(camRight, 0.35).normalize();
    renderer.render(scene, camera);
    drawOverlay();
    placeHtml();
    if (!idle) adaptResolution(dt);
  }
  raf = requestAnimationFrame(frame);

  /* ── globe.gl-compatible facade ── */
  const methods = {
    pointOfView,
    controls: () => controls,
    camera: () => camera,
    scene: () => scene,
    renderer: () => ({ setPixelRatio() {} }), // resolution is managed adaptively here
    globeMaterial: () => ocean.material,
    getGlobeRadius: () => 1,
    getCoords: (lat, lng, alt = 0) => { const v = vec(lng, lat, 1 + alt); return { x: v.x, y: v.y, z: v.z }; },
    getScreenCoords: (lat, lng, alt = 0) => {
      const v = vec(lng, lat, 1 + alt).project(camera);
      return { x: ((v.x + 1) / 2) * renderer.domElement.clientWidth, y: ((1 - v.y) / 2) * renderer.domElement.clientHeight };
    },
    toGlobeCoords: (x, y) => surfaceAt(x, y),
    pauseAnimation: () => { paused = true; return api; },
    resumeAnimation: () => { paused = false; dirty = true; last = performance.now(); return api; },
    width: () => { resize(); return api; },
    height: () => { resize(); return api; },
    polygonsData: (list) => {
      if (list === undefined) return states ? [...countries, ...states.list] : countries;
      setStates(list.filter((f) => !idMap.has(f))); // anything that isn't a country = a states/provinces layer
      return api;
    },
    extrude: (on) => { extrudeOn = !!on; if (on) ensureWalls(); retarget(); return api; },
    htmlElementsData: (d) => { if (d === undefined) return htmlItems.map((x) => x.d); setHtml(d); return api; },
    ringsData: (d) => { if (d === undefined) return rings.map((r) => r.d); setRings(d); return api; },
    arcsData: (d) => { if (d === undefined) return arcObjs; setArcs(d); return api; },
    labelsData: (d) => { if (d === undefined) return labels; setLabels(d); return api; },
    markersData: (d) => { if (d === undefined) return markers; setMarkers(d); return api; },
    pathsData: (d) => { if (d === undefined) return paths; setPaths(d); return api; },
    overlayStats: () => stats,
    // v2-only extras
    outlineCountry,
    hovered: () => hoverF,
    isV2: true,
  };
  const api = new Proxy(methods, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== "string" || prop === "then" || prop === "toJSON") return undefined; // never look like a Promise
      // any other globe.gl setter: store it and stay chainable (unported layers simply wait for later stages)
      return (...args) => {
        if (!args.length) return acc[prop] ?? handlers[prop];
        if (prop.startsWith("on")) handlers[prop] = args[0];
        else acc[prop] = args[0];
        if (prop === "polygonCapColor") recolour();
        if (prop === "polygonAltitude") retarget();
        dirty = true;
        return api;
      };
    },
  });

  recolour();
  return api;
}

function vec(lng, lat, r = 1) {
  const phi = (90 - lat) * RAD, theta = (90 - lng) * RAD;
  return new THREE.Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}
const vecArr = (lng, lat, r) => vec(lng, lat, r).toArray();

window.GeoEngine = { create };
