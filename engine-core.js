/* ═══════════════════════════════════════════════════════════
   GEOVERSE ENGINE · CORE (no WebGL — pure geometry & picking)
   Builds the whole world as ONE land mesh, border line segments,
   a political colouring, and fast lat/lng → country lookup.
   Plain script: exposes globalThis.GeoCore (needs global `earcut`, `d3`).
   ═══════════════════════════════════════════════════════════ */
(function () {
  const RAD = Math.PI / 180;

  // lat/lng (degrees) → unit vector. Same axes as globe.gl so existing maths keeps working:
  // y = north, lng 0 faces +z, lng 90°E faces +x.
  function toVec(lng, lat, r = 1) {
    const phi = (90 - lat) * RAD, theta = (90 - lng) * RAD;
    return [r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)];
  }

  function toLngLat([x, y, z]) {
    const r = Math.hypot(x, y, z);
    const lat = 90 - Math.acos(Math.max(-1, Math.min(1, y / r))) / RAD;
    const lng = 90 - Math.atan2(z, x) / RAD;
    return [((lng + 540) % 360) - 180, lat];
  }

  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

  // Great-circle interpolation between two unit vectors
  function slerp(a, b, t) {
    const w = angle(a, b);
    if (w < 1e-9) return a.slice();
    const s = Math.sin(w), k0 = Math.sin((1 - t) * w) / s, k1 = Math.sin(t * w) / s;
    return [a[0] * k0 + b[0] * k1, a[1] * k0 + b[1] * k1, a[2] * k0 + b[2] * k1];
  }

  // Ring (lng/lat) → unit vectors, densified so no edge is longer than maxDeg.
  // Shared borders densify identically from both sides, so neighbours never crack apart.
  function densifyRing(ring, maxDeg) {
    const out = [];
    const n = ring.length - (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = toVec(ring[i][0], ring[i][1]);
      const b = toVec(ring[(i + 1) % n][0], ring[(i + 1) % n][1]);
      out.push(a);
      const steps = Math.ceil(angle(a, b) / (maxDeg * RAD));
      for (let s = 1; s < steps; s++) out.push(norm(slerp(a, b, s / steps)));
    }
    return out;
  }

  // Azimuthal-equidistant projection centred on `c` — flat enough to triangulate any
  // single country (incl. ones wrapping the date line, and Antarctica round the pole).
  function makeProjector(c) {
    const up = Math.abs(c[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
    let e1 = [up[1] * c[2] - up[2] * c[1], up[2] * c[0] - up[0] * c[2], up[0] * c[1] - up[1] * c[0]];
    e1 = norm(e1);
    const e2 = [c[1] * e1[2] - c[2] * e1[1], c[2] * e1[0] - c[0] * e1[2], c[0] * e1[1] - c[1] * e1[0]];
    return (v) => {
      const d = angle(c, v);
      const x = v[0] * e1[0] + v[1] * e1[1] + v[2] * e1[2];
      const y = v[0] * e2[0] + v[1] * e2[1] + v[2] * e2[2];
      const l = Math.hypot(x, y) || 1;
      return [(x / l) * d, (y / l) * d];
    };
  }

  /**
   * Build one merged land mesh.
   * features: GeoJSON features. idOf(f, i) → numeric id (0 = not pickable, e.g. Antarctica).
   * radiusOf(f) → shell radius (lets one country sit a hair above overlapping claims).
   * Returns { positions: Float32Array, ids: Float32Array, index: Uint32Array, triangles }
   */
  function buildLand(features, { idOf = (f, i) => i + 1, radiusOf = () => 1.001, edgeDeg = 1, splitDeg = 2 } = {}) {
    const pos = [], ids = [], idx = [];
    const splitRad = splitDeg * RAD;

    features.forEach((f, fi) => {
      const g = f.geometry;
      if (!g) return;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      const id = idOf(f, fi), R = radiusOf(f);

      for (const poly of polys) {
        const rings = poly.map((r) => densifyRing(r, edgeDeg)).filter((r) => r.length >= 3);
        if (!rings.length) continue;
        // centre of the outer ring (mean of unit vectors) for the local projection
        let c = [0, 0, 0];
        for (const v of rings[0]) { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; }
        c = norm(c);
        const proj = makeProjector(c);

        const verts = [], flat = [], holes = [];
        rings.forEach((r, ri) => {
          if (ri) holes.push(verts.length);
          for (const v of r) { verts.push(v); const p = proj(v); flat.push(p[0], p[1]); }
        });
        const tri = earcut(flat, holes.length ? holes : null, 2);
        if (!tri.length) continue;

        // Conforming subdivision on the sphere: split any edge longer than splitDeg at its
        // great-circle midpoint (cached per edge, so both triangles on an edge agree).
        const local = verts.slice();
        const mid = new Map();
        const midpoint = (a, b) => {
          const k = a < b ? a * 1e7 + b : b * 1e7 + a;
          let m = mid.get(k);
          if (m === undefined) { m = local.length; local.push(norm(slerp(local[a], local[b], 0.5))); mid.set(k, m); }
          return m;
        };
        const long = (a, b) => angle(local[a], local[b]) > splitRad;
        const out = [];
        const stack = [];
        for (let i = 0; i < tri.length; i += 3) stack.push([tri[i], tri[i + 1], tri[i + 2]]);
        let guard = 0;
        while (stack.length) {
          const [a, b, cc] = stack.pop();
          if (++guard > 4e6) break; // safety valve
          const ab = long(a, b), bc = long(b, cc), ca = long(cc, a);
          const n = ab + bc + ca;
          if (!n) { out.push(a, b, cc); continue; }
          if (n === 3) {
            const m1 = midpoint(a, b), m2 = midpoint(b, cc), m3 = midpoint(cc, a);
            stack.push([a, m1, m3], [m1, b, m2], [m3, m2, cc], [m1, m2, m3]);
          } else if (n === 1) {
            if (ab) { const m = midpoint(a, b); stack.push([a, m, cc], [m, b, cc]); }
            else if (bc) { const m = midpoint(b, cc); stack.push([a, b, m], [a, m, cc]); }
            else { const m = midpoint(cc, a); stack.push([a, b, m], [m, b, cc]); }
          } else { // two long edges
            if (!ab) { const m2 = midpoint(b, cc), m3 = midpoint(cc, a); stack.push([a, b, m2], [a, m2, m3], [m3, m2, cc]); }
            else if (!bc) { const m1 = midpoint(a, b), m3 = midpoint(cc, a); stack.push([a, m1, m3], [m1, b, cc], [m1, cc, m3]); }
            else { const m1 = midpoint(a, b), m2 = midpoint(b, cc); stack.push([a, m1, cc], [m1, b, m2], [m1, m2, cc]); }
          }
        }

        const base = pos.length / 3;
        for (const v of local) { pos.push(v[0] * R, v[1] * R, v[2] * R); ids.push(id); }
        // keep a consistent outward-facing winding
        for (let i = 0; i < out.length; i += 3) {
          const A = local[out[i]], B = local[out[i + 1]], C = local[out[i + 2]];
          const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          if (nx * A[0] + ny * A[1] + nz * A[2] < 0) idx.push(base + out[i], base + out[i + 2], base + out[i + 1]);
          else idx.push(base + out[i], base + out[i + 1], base + out[i + 2]);
        }
      }
    });
    return { positions: new Float32Array(pos), ids: new Float32Array(ids), index: new Uint32Array(idx), triangles: idx.length / 3 };
  }

  /** Border/coast line segments (pairs of xyz) for all features, densified so they hug the sphere. */
  function buildLines(features, { r = 1.0016, edgeDeg = 1 } = {}) {
    const seg = [];
    for (const f of features) {
      const g = f.geometry;
      if (!g) continue;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      for (const poly of polys) for (const ring of poly) {
        const pts = densifyRing(ring, edgeDeg);
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          seg.push(a[0] * r, a[1] * r, a[2] * r, b[0] * r, b[1] * r, b[2] * r);
        }
      }
    }
    return new Float32Array(seg);
  }

  /**
   * Side walls for 3D bars: a quad per (densified) outline edge. Bottom vertices have aTop = 0,
   * top ones aTop = 1 — the shader lifts the top by that country's height. aN = the wall's facing.
   */
  function buildWalls(features, { idOf = (f, i) => i + 1, r = 1.0005, edgeDeg = 1 } = {}) {
    const pos = [], ids = [], top = [], nrm = [], idx = [];
    features.forEach((f, fi) => {
      const g = f.geometry;
      if (!g) return;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      const id = idOf(f, fi);
      for (const poly of polys) for (const ring of poly) {
        const pts = densifyRing(ring, edgeDeg);
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          // wall facing: perpendicular to both the edge and "up"
          const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
          const n = norm([ey * a[2] - ez * a[1], ez * a[0] - ex * a[2], ex * a[1] - ey * a[0]]);
          const base = pos.length / 3;
          for (const [v, t] of [[a, 0], [b, 0], [b, 1], [a, 1]]) {
            pos.push(v[0] * r, v[1] * r, v[2] * r); ids.push(id); top.push(t); nrm.push(n[0], n[1], n[2]);
          }
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    });
    return { positions: new Float32Array(pos), ids: new Float32Array(ids), top: new Float32Array(top), normals: new Float32Array(nrm), index: new Uint32Array(idx) };
  }

  /** Greedy map colouring: neighbours (by shared border) never get the same palette slot. */
  function colourCountries(features, neighbors, nColours) {
    const order = features.map((_, i) => i).sort((a, b) => (neighbors[b]?.length || 0) - (neighbors[a]?.length || 0));
    const col = new Array(features.length).fill(-1);
    for (const i of order) {
      const used = new Set((neighbors[i] || []).map((j) => col[j]));
      let c = i % nColours; // spread starting points so the map isn't dominated by colour 0
      for (let k = 0; k < nColours; k++) { const cc = (c + k) % nColours; if (!used.has(cc)) { c = cc; break; } }
      col[i] = c;
    }
    return col;
  }

  /**
   * Fast country lookup: a 2° grid of candidate countries, then an exact spherical test.
   * Smaller countries are tested first, so enclaves (Vatican inside Italy) win; `priority`
   * can push a country further forward (e.g. one drawn above overlapping claims).
   */
  function makePicker(features, { priority = () => 0 } = {}) {
    const CELL = 2, COLS = 180, ROWS = 90;
    const area = features.map((f) => d3.geoArea(f));
    const rank = features.map((f, i) => [priority(f), -area[i]]);
    const order = features.map((_, i) => i).sort((a, b) => rank[b][0] - rank[a][0] || rank[b][1] - rank[a][1]);
    const grid = Array.from({ length: COLS * ROWS }, () => []);
    for (const i of order) {
      const [[w, s], [e, n]] = d3.geoBounds(features[i]);
      const spans = w > e ? [[w, 180], [-180, e]] : [[w, e]]; // date-line wrap → two spans
      const r0 = Math.max(0, Math.floor((s + 90) / CELL)), r1 = Math.min(ROWS - 1, Math.floor((n + 90) / CELL));
      for (const [a, b] of spans) {
        const c0 = Math.max(0, Math.floor((a + 180) / CELL)), c1 = Math.min(COLS - 1, Math.floor((b + 180) / CELL));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r * COLS + c].push(i);
      }
    }
    let last = -1;
    return function pick(lng, lat) {
      const r = Math.min(ROWS - 1, Math.max(0, Math.floor((lat + 90) / CELL)));
      const c = Math.min(COLS - 1, Math.max(0, Math.floor((((lng + 540) % 360) - 180 + 180) / CELL)));
      const cand = grid[r * COLS + c];
      // hovering usually stays on the same country: test it first
      if (last >= 0 && cand.includes(last) && d3.geoContains(features[last], [lng, lat])) {
        const better = cand.find((i) => i !== last && rank[i][1] > rank[last][1] - 0 && rank[i][0] >= rank[last][0] && area[i] < area[last] && d3.geoContains(features[i], [lng, lat]));
        if (better === undefined) return features[last];
      }
      for (const i of cand) if (d3.geoContains(features[i], [lng, lat])) { last = i; return features[i]; }
      return null;
    };
  }

  globalThis.GeoCore = { toVec, toLngLat, buildLand, buildLines, buildWalls, colourCountries, makePicker };
})();
