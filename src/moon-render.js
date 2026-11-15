// Mission 2 drawing: the Moon map for trip planning and the cargo icons. Shapes from code, pixel style.
const MoonRender = (function () {
  const W = 640, H = 360;
  let ctx;
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  function disc(cx, cy, r, c, dither) {
    ctx.fillStyle = c;
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r - dy * dy));
      if (!dither) { ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2 + 1, 1); continue; }
      for (let dx = -half; dx <= half; dx++) if ((dx + dy) & 1) ctx.fillRect(Math.round(cx + dx), Math.round(cy + dy), 1, 1);
    }
  }
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = [];
  for (let i = 0; i < 160; i++) stars.push({ x: rnd() * W, y: rnd() * H, b: rnd() });

  // Near-side orthographic projection: Moon centre and radius on the canvas.
  const M = { x: 230, y: 176, r: 150 };
  const rad = (d) => (d * Math.PI) / 180;
  function project(lat, lon) {
    return { x: M.x + M.r * Math.cos(rad(lat)) * Math.sin(rad(lon)), y: M.y - M.r * Math.sin(rad(lat)) };
  }

  // Main dark seas (maria) and bright craters, at their real positions.
  const MARIA = [
    [18, -57, 0.36], [32.8, -15.6, 0.2], [28, 17.5, 0.12], [8.5, 31.4, 0.15], [17, 59.1, 0.08],
    [-7.8, 51.3, 0.09], [-21.3, -16.6, 0.1], [-24.4, -38.6, 0.07], [-13.3, 35.5, 0.06], [-3.4, -15.6, 0.05],
  ];
  const CRATERS = [[-43.3, -11.2, 6, true], [9.6, -20.1, 7, true], [8.1, -38, 5, false], [-89.5, 0, 6, false], [26.5, -10, 4, false]];

  let moonCache = null;
  function bakeMoon() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const saved = ctx;
    ctx = c.getContext('2d');
    disc(M.x, M.y, M.r, '#a8a6b0');
    for (const [lat, lon, size] of MARIA) {
      const p = project(lat, lon);
      const r = Math.round(M.r * size * Math.max(0.35, Math.cos(rad(lon))));
      disc(p.x, p.y, r + 3, '#7e7c8a', true);
      disc(p.x, p.y, r, '#6e6c7a');
    }
    seed = 17;
    for (let i = 0; i < 220; i++) { // small craters: dark pit with a lit rim
      const lat = (rnd() - 0.5) * 170, lon = (rnd() - 0.5) * 170;
      const p = project(lat, lon), r = 1 + Math.floor(rnd() * 3);
      disc(p.x, p.y, r, '#8c8a96'); px(p.x - r, p.y - r, 1, 1, '#d0ced8');
    }
    for (const [lat, lon, r, rays] of CRATERS) {
      const p = project(lat, lon);
      if (rays) for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2, len = 30 + (k % 3) * 14;
        for (let s = 6; s < len; s += 2) px(p.x + Math.cos(a) * s, p.y + Math.sin(a) * s * 0.9, 1, 1, '#c8c6d0');
      }
      disc(p.x, p.y, r + 1, '#d8d6e0'); disc(p.x + 1, p.y + 1, r - 1, '#8a8896');
    }
    // Limb darkening and the sunlit edge: darker ring at the rim, light from the upper left.
    ctx.globalAlpha = 0.35;
    for (let dy = -M.r; dy <= M.r; dy++) {
      const half = Math.floor(Math.sqrt(M.r * M.r - dy * dy));
      for (let dx = -half; dx <= half; dx += 1) {
        const d = Math.sqrt(dx * dx + dy * dy) / M.r;
        if (d > 0.82 && ((dx + dy) & 1)) px(M.x + dx, M.y + dy, 1, 1, '#3a3848');
      }
    }
    ctx.globalAlpha = 1;
    ctx = saved;
    return c;
  }

  // sites: list with lat/lon; selected: id; t: seconds. Draws the planning map.
  function drawMap(context, t, sites, selected, hover) {
    ctx = context;
    px(0, 0, W, H, '#05040c');
    for (const s of stars) if (Math.sin(t * 1.5 + s.b * 30) > -0.5) px(s.x, s.y, 1, 1, s.b > 0.85 ? '#ffffff' : '#8a84b0');
    // Earth, upper right: the same real NASA-map globe as in the flight.
    drawEarth(556, 74, 30);
    if (typeof PixelText !== 'undefined') PixelText.draw(ctx, 'EARTH', 556, 114, '#a8a4d0', 2, 'center');
    if (!moonCache) moonCache = bakeMoon();
    ctx.drawImage(moonCache, 0, 0);
    // Landing sites: a base flag on a pole over a ringed marker (blue = water ice, orange = no ice).
    for (const site of sites) {
      const p = project(site.lat, site.lon);
      const sel = site.id === selected, hov = site.id === hover;
      const blink = Math.floor(t * 3) % 2;
      const col = sel ? '#4dffc3' : site.ice ? '#6fe3ff' : '#ff9a3d';
      if (sel) { // targeting brackets
        const r = 13 + (blink ? 1 : 0);
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { px(p.x + dx * r - (dx < 0 ? 0 : 4), p.y + dy * r, 5, 1, col); px(p.x + dx * r, p.y + dy * r - (dy < 0 ? 0 : 4), 1, 5, col); }
      }
      disc(p.x, p.y, 7, '#05040c'); disc(p.x, p.y, 5, col); disc(p.x, p.y, 3, '#05040c'); disc(p.x, p.y, 1, col);
      const fy = p.y - 7 - (sel || hov ? 2 : 0);
      px(p.x, fy - 14, 1, 14, '#e6ecf6'); // pole
      px(p.x + 1, fy - 14, 9, 6, '#05040c'); px(p.x + 1, fy - 13, 8, 4, col); px(p.x + 3, fy - 12, 2, 2, '#05040c'); // flag
      if ((sel || hov) && typeof PixelText !== 'undefined') {
        const lx = M.x + M.r + 24, ly = Math.min(H - 34, Math.max(30, p.y - 8));
        ctx.fillStyle = col;
        for (let x = p.x + 9; x < lx - 4; x += 2) ctx.fillRect(Math.round(x), Math.round(p.y + ((x - p.x) / (lx - p.x)) * (ly + 6 - p.y)), 1, 1);
        PixelText.draw(ctx, site.name.toUpperCase(), lx, ly, col, 2);
      }
    }
    if (typeof PixelText !== 'undefined') {
      PixelText.draw(ctx, 'NEAR SIDE OF THE MOON', 12, 10, '#a8a4d0', 2);
      PixelText.draw(ctx, 'ORANGE: NO ICE   BLUE: WATER ICE', 12, H - 22, '#a8a4d0', 2);
    }
  }

  // Pick the site closest to a click (canvas coordinates), within 20 px.
  function siteAt(sites, x, y) {
    let best = null, bd = 20;
    for (const s of sites) { const p = project(s.lat, s.lon); const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  // 16x16 cargo icons.
  const ICONS = {
    oxygen: (p) => { p(5, 1, 6, 2, '#5c6374'); p(4, 3, 8, 12, '#6fe3ff'); p(4, 3, 2, 12, '#b0f0ff'); p(10, 3, 2, 12, '#3a8ab0'); p(6, 7, 4, 3, '#ffffff'); },
    water: (p) => { p(5, 1, 6, 2, '#3a7bd5'); p(3, 3, 10, 12, '#3a7bd5'); p(4, 7, 8, 7, '#6aa6f0'); p(4, 7, 8, 1, '#c8e4ff'); p(3, 3, 1, 12, '#9ac8ff'); },
    food: (p) => { p(2, 4, 12, 10, '#c8962a'); p(2, 4, 12, 2, '#ffd36b'); p(5, 7, 6, 4, '#e6ecf6'); p(6, 8, 4, 2, '#ff4d6a'); },
    habitat: (p) => { p(2, 8, 12, 6, '#e6ecf6'); p(4, 5, 8, 3, '#e6ecf6'); p(6, 3, 4, 2, '#e6ecf6'); p(2, 13, 12, 1, '#8a93ab'); p(7, 10, 2, 4, '#3a3f4c'); p(4, 8, 2, 2, '#6fe3ff'); },
    solar: (p) => { p(1, 3, 14, 8, '#2a3a8a'); for (let x = 1; x < 15; x += 4) p(x, 3, 1, 8, '#6a7ad0'); p(1, 7, 14, 1, '#6a7ad0'); p(7, 11, 2, 4, '#8a93ab'); },
    batteries: (p) => { p(3, 3, 10, 12, '#3a3f4c'); p(6, 1, 4, 2, '#8a93ab'); p(4, 9, 8, 5, '#4dffc3'); p(4, 5, 8, 3, '#2a8a70'); p(7, 5, 2, 3, '#ffd34d'); },
    shield: (p) => { p(3, 1, 10, 3, '#3a7bd5'); p(2, 4, 12, 6, '#3a7bd5'); p(4, 10, 8, 3, '#3a7bd5'); p(6, 13, 4, 2, '#3a7bd5'); p(5, 4, 6, 6, '#6aa6f0'); p(7, 3, 2, 9, '#c8e4ff'); },
    filters: (p) => { p(2, 3, 12, 10, '#8a93ab'); for (let x = 3; x < 14; x += 2) p(x, 4, 1, 8, '#5c6374'); p(2, 3, 12, 1, '#c9d1e6'); },
    medkit: (p) => { p(2, 4, 12, 10, '#e6ecf6'); p(6, 2, 4, 2, '#8a93ab'); p(7, 6, 2, 6, '#ff4d6a'); p(5, 8, 6, 2, '#ff4d6a'); },
    repair: (p) => { p(1, 6, 10, 5, '#c9d1e6'); p(1, 6, 10, 1, '#eef2fa'); p(3, 7, 4, 3, '#ff9a3d'); p(11, 7, 3, 3, '#5c6374'); p(14, 8, 1, 1, '#ffcf6b'); },
    rover: (p) => { p(2, 6, 12, 4, '#e6ecf6'); p(4, 4, 6, 2, '#c9d1e6'); p(11, 2, 1, 4, '#8a93ab'); p(10, 1, 3, 1, '#c9d1e6'); for (const x of [2, 7, 12]) { p(x, 10, 3, 3, '#3a3f4c'); p(x + 1, 11, 1, 1, '#8a93ab'); } },
    science: (p) => { p(6, 1, 4, 8, '#c9d1e6'); p(5, 8, 6, 6, '#6fe3ff'); p(5, 11, 6, 3, '#4dffc3'); p(5, 8, 1, 6, '#b0f0ff'); p(8, 4, 1, 3, '#8a93ab'); },
    guitar: (p) => { p(7, 0, 2, 7, '#8a5a2a'); p(4, 7, 8, 7, '#c08a4a'); p(5, 6, 6, 2, '#c08a4a'); p(7, 9, 2, 2, '#3a2010'); p(6, 0, 4, 1, '#3a2010'); },
    snacks: (p) => { p(3, 3, 10, 11, '#ff4d6a'); p(3, 3, 10, 2, '#ff9aaa'); p(5, 7, 6, 4, '#ffd34d'); p(4, 1, 8, 2, '#c8303a'); },
  };
  function icon(context, id) {
    context.clearRect(0, 0, 16, 16);
    const p = (x, y, w, h, c) => { context.fillStyle = c; context.fillRect(x, y, w, h); };
    if (ICONS[id]) ICONS[id](p);
  }

  // ---------- Flight: full-screen chase camera ----------
  // The ship stays near the middle; the world moves. Earth falls away on the left, the Moon grows on the
  // right, stars stream past in three layers. The Sun sits off the top-right corner and lights everything.
  const SHIP = { x: 250, y: 176 };
  const LIGHT = (() => { const v = [0.62, -0.38, 0.55], n = Math.hypot(...v); return v.map((a) => a / n); })();
  const far = []; const milky = []; seed = 41;
  for (let i = 0; i < 700; i++) {
    const x = rnd() * W, off = (rnd() + rnd() + rnd() - 1.5) * 50;
    milky.push({ x, y: 40 + x * 0.35 + off, c: rnd() < 0.5 ? 'rgba(160,150,220,0.35)' : 'rgba(220,210,255,0.5)' });
  }
  for (let i = 0; i < 260; i++) far.push({ x: rnd() * W, y: rnd() * H, l: i % 3, b: rnd() });

  // Paint into a new offscreen canvas with the same helpers (px, disc), then hand it back.
  function canvasOf(w, h, paint) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const saved = ctx;
    ctx = c.getContext('2d');
    paint(c);
    ctx = saved;
    return c;
  }

  // Sunlight on a sphere drawn in canvas c: night side darkened to `night`, dithered terminator.
  const lightAt = (nx, ny) => nx * LIGHT[0] + ny * LIGHT[1] + Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * LIGHT[2];
  function shadeSphere(c, cx, cy, r, night) {
    const g = c.getContext('2d'), img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const nx = (x - cx) / r, ny = (y - cy) / r;
      if (nx * nx + ny * ny > 1.25) continue; // a bit past the rim so the edge pixels and the glow get shaded too
      const l = lightAt(nx, ny);
      const k = l < -0.05 ? night : l < 0.07 ? ((x + y) & 1 ? night : 0.75) : Math.min(1.1, 0.8 + l * 0.35);
      const i = (y * c.width + x) * 4;
      d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k);
    }
    g.putImageData(img, 0, 0);
  }

  // Real Earth from NASA GIBS world maps (data/earth-maps.js, live clouds from moon-main.js): pixel arrays
  // read once the images decode. Until then the drawn Earth below is used.
  const tex = { day: null, night: null, clouds: null, cloudDate: '', version: 0 };
  function setEarthMap(kind, img, date) {
    if (kind === 'clouds' && tex.clouds && date && date < tex.cloudDate) return; // keep the newer clouds
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data, n = c.width * c.height;
      // day: RGB as is. clouds: white, grey-free pixels become cloud cover 0..1. night: the bright city lights.
      const v = kind === 'day' ? d : new Float32Array(n);
      if (kind === 'clouds') for (let i = 0; i < n; i++) {
        const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], mn = Math.min(r, gg, b), mx = Math.max(r, gg, b);
        v[i] = Math.max(0, Math.min(1, (mn - 135) / 90)) * (mx - mn < 45 ? 1 : 0.35);
      }
      if (kind === 'night') for (let i = 0; i < n; i++) v[i] = Math.max(0, Math.min(1, (d[i * 4] - 75) / 140));
      tex[kind] = { w: c.width, h: c.height, v };
      if (kind === 'clouds') tex.cloudDate = date || '';
      tex.version++;
    } catch (e) { /* image blocked from reading (no CORS): keep the old map */ }
  }
  if (typeof EARTH_MAPS !== 'undefined' && typeof Image !== 'undefined') {
    for (const k of ['day', 'night', 'clouds']) { const img = new Image(); img.onload = () => setEarthMap(k, img, EARTH_MAPS.saved); img.src = EARTH_MAPS[k]; }
  }

  // Orthographic globe: north pole tipped toward the camera, spun by rot (radians of longitude).
  const TILT = 0.38, BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  // Everything about a globe pixel that does not change as Earth turns (where it is on the map before the
  // spin, and how the Sun lights it), worked out once per size. Turning Earth then only re-reads the maps.
  // Big sizes can be prepared a little per frame ahead of time (prepareEarth), so nothing freezes later.
  const geoCache = new Map(), geoWork = new Map();
  function earthGeo(r, budgetMs = Infinity) {
    const done = geoCache.get(r);
    if (done) return done;
    const size = r * 2 + 16, cx = r + 8, cy = r + 8, ct = Math.cos(TILT), st = Math.sin(TILT);
    const hz = LIGHT[2] + 1, hn = Math.hypot(LIGHT[0], LIGHT[1], hz); // half vector for the sun glint
    let G = geoWork.get(r);
    if (!G) {
      const m = size * size, f = () => new Float32Array(m);
      G = { size, n: 0, y: 0, idx: new Int32Array(m), glow: f(), lonN: f(), vN: f(), k: f(), lit: f(), rim: f(), warm: f(), spec: f() };
      geoWork.set(r, G);
    }
    const t0 = performance.now();
    for (; G.y < size; G.y++) {
      if (performance.now() - t0 > budgetMs) return null; // not finished: carry on next frame
      const y = G.y;
      for (let x = 0; x < size; x++) {
        const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r, q = nx * nx + ny * ny, e = G.n;
        if (q > 1) { // thin blue atmosphere glow beyond the rim, on the sunlit side
          const out = (Math.sqrt(q) - 1) * r;
          if (out > 6) continue;
          const a = (1 - out / 6) ** 2 * Math.max(0, Math.min(1, (nx * LIGHT[0] + ny * LIGHT[1]) / Math.sqrt(q) + 0.35));
          if (a > 0) { G.idx[e] = y * size + x; G.glow[e] = a; G.n++; }
          continue;
        }
        const nz = Math.sqrt(1 - q), vy = -ny, wy = vy * ct + nz * st, wz = -vy * st + nz * ct;
        const l = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
        G.idx[e] = y * size + x;
        G.lonN[e] = Math.atan2(nx, wz) / (2 * Math.PI);
        G.vN[e] = 0.5 - Math.asin(Math.max(-1, Math.min(1, wy))) / Math.PI;
        G.k[e] = Math.max(0, Math.min(1, (l + 0.06) / 0.2 + (BAYER[(x & 3) + (y & 3) * 4] / 16 - 0.5) * 0.35)); // dithered terminator
        G.lit[e] = 0.3 + 0.9 * Math.pow(Math.max(0, l), 0.6); // sunlight
        G.rim[e] = Math.pow(1 - nz, 2.2) * 0.75; // blue haze toward the edge
        G.warm[e] = Math.max(0, 1 - Math.abs(l - 0.02) / 0.09); // sunset colours along the terminator
        G.spec[e] = Math.pow(Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * hz) / hn), 60); // sun glint strength
        G.n++;
      }
    }
    geoWork.delete(r);
    if (geoCache.size > 12) geoCache.clear();
    geoCache.set(r, G);
    return G;
  }
  // Paints globe pixels [from, to) of the turned Earth into image data d. Only map lookups and sums.
  function paintEarthRange(G, d, rot, from, to) {
    const D = tex.day, N = tex.night, C = tex.clouds, rotN = rot / (2 * Math.PI) + 0.5;
    const at = (m, u, vN) => Math.min(m.h - 1, (vN * m.h) | 0) * m.w + ((u * m.w) | 0);
    for (let e = from; e < to; e++) {
      const i = G.idx[e] * 4;
      if (G.glow[e] > 0) { d[i] = 120; d[i + 1] = 180; d[i + 2] = 255; d[i + 3] = 230 * G.glow[e]; continue; }
      let u = G.lonN[e] + rotN; u -= Math.floor(u);
      const vN = G.vN[e], j = at(D, u, vN), cl = C ? C.v[at(C, u, vN)] : 0;
      let R = D.v[j * 4], Gc = D.v[j * 4 + 1], B = D.v[j * 4 + 2];
      const ocean = B > R + 12 && R < 70 ? 1 : 0, dayR = R, dayG = Gc, dayB = B;
      R += (238 - R) * cl; Gc += (242 - Gc) * cl; B += (250 - B) * cl;
      const k = G.k[e], lit = G.lit[e], rim = G.rim[e], warm = G.warm[e], spec = ocean * (1 - cl) * G.spec[e];
      R = (R * lit + (110 - R * lit) * rim + 60 * warm + 200 * spec) * k;
      Gc = (Gc * lit + (170 - Gc * lit) * rim + 18 * warm + 190 * spec) * k;
      B = (B * lit + (255 - B * lit) * rim + 160 * spec) * k;
      // Night: very dim surface plus city lights (dimmed under clouds).
      const city = N ? N.v[at(N, u, vN)] * (1 - cl * 0.8) * (1 - k) : 0;
      d[i] = Math.min(255, R + (dayR * 0.05 + 255 * city) * (1 - k));
      d[i + 1] = Math.min(255, Gc + (dayG * 0.05 + 200 * city) * (1 - k));
      d[i + 2] = Math.min(255, B + (dayB * 0.08 + 110 * city) * (1 - k));
      d[i + 3] = 255;
    }
  }

  // Rendered Earths, one slot per size: { key, c (canvas) }. A key says which spin and maps it shows.
  const earthImgs = new Map();
  const earthKey = (base, rot) => `${Math.round(rot * base)}:${tex.version}`;
  function earthSlot(base) {
    let slot = earthImgs.get(base);
    if (!slot) { const c = document.createElement('canvas'); c.width = c.height = base * 2 + 16; earthImgs.set(base, (slot = { key: '', c })); }
    return slot;
  }
  function renderEarth(base, rot, budgetMs = Infinity, background = false) {
    const slot = earthSlot(base), key = earthKey(base, rot);
    if (slot.key === key) return slot.c;
    // With a time budget: paint the new spin in slices while the old picture stays on screen, then swap.
    if (budgetMs < Infinity && slot.key && (slot.key !== 'blank' || background)) { // never show a half-painted blank
      const G = earthGeo(base);
      if (!slot.img) slot.img = slot.c.getContext('2d').createImageData(slot.c.width, slot.c.height); // one buffer per size: no garbage
      if (!slot.job || slot.job.key !== key) slot.job = { key, rot: Math.round(rot * base) / base, e: 0, img: slot.img };
      const J = slot.job, t0 = performance.now();
      while (J.e < G.n && performance.now() - t0 < budgetMs) { const to = Math.min(G.n, J.e + 3000); paintEarthRange(G, J.img.data, J.rot, J.e, to); J.e = to; }
      if (J.e >= G.n) { slot.c.getContext('2d').putImageData(J.img, 0, 0); slot.key = J.key; slot.job = null; }
      return slot.c;
    }
    const G = earthGeo(base), g = slot.c.getContext('2d'), out = slot.img || (slot.img = g.createImageData(slot.c.width, slot.c.height));
    paintEarthRange(G, out.data, Math.round(rot * base) / base, 0, G.n);
    g.putImageData(out, 0, 0);
    slot.key = key;
    return slot.c;
  }
  // Called every frame during Earth orbit: builds the flight's big Earths a few milliseconds at a time,
  // including the departure picture itself, so the flight starts without a freeze.
  function prepareEarth(sizes = [150, 240], budgetMs = 3) {
    if (!tex.day) return;
    for (const r of sizes) if (!earthGeo(r, budgetMs)) return;
    for (const base of sizes) { // then paint them at the spin the flight starts with, a slice per frame
      const slot = earthSlot(base);
      if (slot.key === earthKey(base, 0.26)) continue;
      if (!slot.key) slot.key = 'blank'; // lets renderEarth paint in slices instead of all at once
      renderEarth(base, 0.26, budgetMs, true);
      return;
    }
  }

  // Flight art that never changes, built ahead of time in idle moments (one piece per call).
  const warmTasks = [() => { if (!nebImg) nebImg = bakeNebula(); }, () => { if (!shipImg) shipImg = bakeShip(); }, () => litMoon(), () => { if (!sunImg) sunImg = bakeSun(); }, () => { if (!groundImg) groundImg = bakeGround(); }];
  const warmUp = () => { const task = warmTasks.shift(); if (task) task(); return warmTasks.length > 0; };

  // Draws Earth with radius r at (x, y). Sizes between 60 and 150 are drawn from the 150 px render, scaled.
  const earthCache = new Map(); // the hand-drawn fallback Earth (before the NASA maps load), per radius
  function drawEarth(x, y, r, scale = 1, rot = 0.26) {
    let img, base = r;
    if (tex.day) {
      base = r > 60 && r < 150 ? 150 : r;
      img = renderEarth(base, rot, base === 150 ? 4 : Infinity); // the turning flight Earth updates over a few frames
    } else {
      img = earthCache.get(r);
      if (!img) {
        if (earthCache.size > 60) earthCache.clear();
        img = canvasOf(r * 2 + 16, r * 2 + 16, (c) => paintEarth(c, r + 8, r + 8, r));
        earthCache.set(r, img);
      }
    }
    const s = img.width * scale * (r / base), smooth = Math.abs(s - img.width) > 0.5;
    if (smooth) ctx.imageSmoothingEnabled = true; // a scaled photo-like globe looks better smoothed
    ctx.drawImage(img, Math.round(x - s / 2), Math.round(y - s / 2), Math.round(s), Math.round(s));
    if (smooth) ctx.imageSmoothingEnabled = false;
  }

  function paintEarth(c, x, y, r) {
    disc(x, y, r + 6, 'rgba(110, 170, 255, 0.25)', true); // atmosphere glow
    disc(x, y, r, '#1e4a9a');
    disc(x - r * 0.08, y - r * 0.08, Math.round(r * 0.92), '#2a62c0');
    seed = 77; // continents, fixed shapes
    const land = [];
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * r * 0.7, cr = Math.round(r * (0.12 + rnd() * 0.16));
      const lx = x + Math.cos(a) * d, ly = y + Math.sin(a) * d;
      disc(lx, ly, cr, i % 3 ? '#3f9a52' : '#b8a060');
      if (cr > 3) disc(lx + cr * 0.2, ly + cr * 0.2, Math.round(cr * 0.5), i % 3 ? '#2f7a40' : '#9a8448');
      land.push([lx, ly, cr]);
    }
    for (let dy = -r; dy < -r * 0.82; dy++) { const half = Math.sqrt(r * r - dy * dy); px(x - half, y + dy, half * 2, 1, '#eef4fa'); } // ice cap
    shadeSphere(c, x, y, r, 0.14);
    seed = 91; // city lights on land in the night side
    for (const [lx, ly, cr] of land) for (let k = 0; k < cr * 2; k++) {
      const a = rnd() * Math.PI * 2, d = rnd() * cr, cx = lx + Math.cos(a) * d, cy = ly + Math.sin(a) * d;
      const nx = (cx - x) / r, ny = (cy - y) / r;
      if (nx * nx + ny * ny < 0.95 && lightAt(nx, ny) < -0.08) px(cx, cy, 1, 1, rnd() < 0.3 ? '#fff2c0' : '#ffc860');
    }
  }

  // The Moon as seen in flight: the map Moon with the same sunlight as Earth (a phase).
  let moonLit = null;
  function litMoon() {
    if (!moonCache) moonCache = bakeMoon();
    const s = M.r * 2 + 1;
    return moonLit || (moonLit = canvasOf(s, s, (c) => { ctx.drawImage(moonCache, M.x - M.r, M.y - M.r, s, s, 0, 0, s, s); shadeSphere(c, M.r, M.r, M.r, 0.08); }));
  }

  // Ship sprite (Orion-style): crew capsule on the right, service module, 4 solar wings, engine bell.
  const SC = { x: 70, y: 50 }; // ship origin inside the sprite
  let shipImg = null;
  function bakeShip() {
    return canvasOf(140, 100, () => {
      const x = SC.x, y = SC.y;
      const wing = (rx, ry, dir, len, lean, near) => {
        px(rx - 1, Math.min(ry, ry + dir * 4), 2, 5, near ? '#9aa0b0' : '#5a6070'); // boom
        for (let k = 4; k < len; k++) {
          const wx = Math.round(rx - 4 - k * lean), wy = ry + dir * k;
          for (let j = 0; j < 9; j++) {
            const frame = k % 5 === 4 || j === 0 || j === 8 || k === len - 1;
            const c = frame ? (near ? '#c9d1e6' : '#6a7088')
              : near ? ((j + k) % 2 ? '#2a3a8a' : j < 4 ? '#4a5ed0' : '#3446a6')
              : ((j + k) % 2 ? '#18204e' : '#222c6a');
            px(wx + j, wy, 1, 1, c);
          }
        }
      };
      wing(x - 10, y - 10, -1, 26, 0.25, false); wing(x - 10, y + 10, 1, 26, 0.25, false); // far pair
      // Engine bell, gold with ribs; darker underneath.
      for (let k = 0; k < 16; k++) {
        const h = Math.round(6 + k * 0.55);
        for (let yy = -h; yy < h; yy++) {
          const c = k === 15 ? '#f0c878' : k % 4 === 2 ? '#8a6420' : yy < -h * 0.4 ? '#e8b85a' : yy < h * 0.4 ? '#c8962a' : '#7a5a20';
          px(x - 31 - k, y + yy, 1, 1, c);
        }
      }
      // Service module: shaded rows, panel seams, radiator lines, gold foil collar.
      for (let yy = -11; yy <= 11; yy++) {
        px(x - 31, y + yy, 32, 1, yy < -8 ? '#eef0f6' : yy < -2 ? '#d4d8e2' : yy < 5 ? '#bcc1ce' : '#8e94a4');
      }
      for (const sx of [-23, -15, -7]) px(x + sx, y - 11, 1, 23, 'rgba(60,66,84,0.45)');
      for (let yy = -9; yy <= -3; yy += 2) px(x - 29, y + yy, 12, 1, '#f8faff');
      for (let yy = -11; yy <= 11; yy++) px(x - 31, y + yy, 3, 1, (yy & 1) ? '#d8a838' : '#b08020');
      px(x - 6, y - 13, 4, 2, '#3a3f4c'); px(x - 6, y + 12, 4, 2, '#3a3f4c'); // RCS pods
      px(x - 12, y - 14, 1, 3, '#9aa0b0'); px(x - 15, y - 16, 7, 2, '#e6eaf2'); // antenna dish
      // Adapter ring and heat shield.
      px(x + 1, y - 12, 3, 24, '#3a3f4c'); px(x + 1, y - 12, 3, 2, '#6a7080');
      px(x + 4, y - 12, 2, 24, '#5a4030');
      // Crew capsule cone, lit from the top right.
      for (let k = 0; k < 26; k++) {
        const h = Math.round(12 - k * 0.33);
        for (let yy = -h; yy < h; yy++) {
          const v = yy / h;
          let c = v < -0.5 ? '#fbf8f2' : v < 0.2 ? '#e2dcd2' : v < 0.6 ? '#c8c2b8' : '#a49e96';
          if (k % 7 === 3 && v > -0.6) c = v < 0.2 ? '#cfc8bd' : '#9a948c';
          px(x + 6 + k, y + yy, 1, 1, c);
        }
      }
      for (const [wx, wy] of [[13, -6], [18, -5]]) { px(x + wx, y + wy, 3, 3, '#1a1830'); px(x + wx, y + wy, 1, 1, '#9ad6ff'); }
      px(x + 22, y - 8, 2, 2, '#4a4a56'); px(x + 22, y + 6, 2, 2, '#4a4a56');
      px(x + 31, y - 3, 5, 5, '#a8aec0'); px(x + 31, y - 3, 5, 2, '#dfe4f0'); px(x + 36, y - 2, 1, 3, '#6a7080'); // docking nose
      wing(x - 16, y - 11, -1, 34, 0.5, true); wing(x - 16, y + 11, 1, 34, 0.5, true); // near pair
    });
  }

  // Main engine flame from the nozzle at (x, y), pointing away from dirx.
  function plume(x, y, dirx, t, len) {
    len = Math.round(len * (0.85 + Math.random() * 0.25));
    for (let k = 0; k < len; k++) {
      const w = Math.max(1, Math.round(9 - k * (8 / len) + Math.sin(t * 70 + k) * 1.2));
      const c = k < len * 0.15 ? '#ffffff' : k < len * 0.45 ? '#ffe9a0' : k < len * 0.8 ? '#ffb547' : 'rgba(255,110,60,0.6)';
      px(x - dirx * k, y - w, 1, w * 2, c);
    }
  }

  // Sun glow off the top-right corner, with a faint lens flare across the view.
  let sunImg = null;
  const bakeSun = () => canvasOf(120, 120, () => {
    for (let r = 58; r > 12; r -= 3) { ctx.globalAlpha = 0.04 + (1 - r / 58) * 0.2; disc(60, 60, r, '#ffd9a0', true); }
    ctx.globalAlpha = 1; disc(60, 60, 12, '#fff0cc'); disc(60, 60, 8, '#ffffff');
  });
  function drawSun(storm, t) {
    if (!sunImg) sunImg = bakeSun();
    const sx = 612, sy = 30;
    ctx.drawImage(sunImg, sx - 60, sy - 60);
    if (storm) { ctx.globalAlpha = 0.3 + 0.2 * Math.sin(t * 9); ctx.drawImage(sunImg, sx - 90, sy - 90, 180, 180); ctx.globalAlpha = 1; }
    px(sx - 140, sy, 200, 1, 'rgba(255,230,190,0.35)'); px(sx, sy - 40, 1, 80, 'rgba(255,230,190,0.25)');
    for (const [k, r, c] of [[0.3, 4, '#6fe3ff'], [0.55, 8, '#a070ff'], [0.8, 3, '#ffd34d']]) {
      ctx.globalAlpha = 0.12; disc(sx + (320 - sx) * k, sy + (180 - sy) * k, r, c); ctx.globalAlpha = 1;
    }
  }

  // Faint nebula clouds, dithered, baked once.
  let nebImg = null;
  function bakeNebula() {
    return canvasOf(W, H, (c) => {
      const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
      seed = 5;
      for (const [bx, by, br, col] of [[120, 80, 130, [70, 30, 120]], [430, 270, 150, [20, 60, 110]], [520, 120, 90, [110, 30, 80]], [250, 310, 100, [40, 30, 100]]]) {
        for (let y = Math.max(0, by - br); y < Math.min(H, by + br); y++) for (let x = Math.max(0, bx - br); x < Math.min(W, bx + br); x++) {
          const q = 1 - Math.hypot(x - bx, (y - by) * 1.4) / br;
          if (q <= 0 || rnd() > q * q * 0.9) continue;
          const i = (y * W + x) * 4;
          d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 40 + q * 60;
        }
      }
      g.putImageData(img, 0, 0);
      for (const m of milky) px(m.x, m.y, 1, 1, m.c); // the Milky Way band is static too
    });
  }

  // Tumbling rocks: 8 rotation frames per size, lit from the Sun.
  const rocks = {};
  function rock(size, frame) {
    const key = `${size}:${frame}`;
    return rocks[key] || (rocks[key] = canvasOf(size, size, () => {
      const c = size / 2, rot = (frame * Math.PI) / 4;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c, a = Math.atan2(dy, dx) - rot;
        if (Math.hypot(dx, dy) > c * (0.72 + 0.18 * Math.sin(3 * a + 1) + 0.1 * Math.sin(5 * a + 2))) continue;
        const l = (dx * LIGHT[0] + dy * LIGHT[1]) / c;
        px(x, y, 1, 1, l > 0.3 ? '#c0b098' : l > -0.2 ? '#8a7a6a' : '#4a3e36');
      }
    }));
  }

  // Low lunar orbit: a strip of grey ground with craters (seen at a slant), tiling sideways.
  const GH = 130;
  let groundImg = null;
  function bakeGround() {
    return canvasOf(W * 2, GH, (c) => {
      const g = c.getContext('2d'), img = g.createImageData(W, GH), d = img.data;
      seed = 23;
      for (let y = 0; y < GH; y++) for (let x = 0; x < W; x++) {
        const mare = Math.sin(x * 0.013) + Math.sin(x * 0.031 + y * 0.05) * 0.6 > 0.8 ? -26 : 0;
        const v = 104 + (y / GH) * 44 + (rnd() - 0.5) * 16 + mare, i = (y * W + x) * 4;
        d[i] = v - 4; d[i + 1] = v - 6; d[i + 2] = v + 6; d[i + 3] = 255;
      }
      const mul = (x, y, k) => { const i = (y * W + (((x % W) + W) % W)) * 4; for (let j = 0; j < 3; j++) d[i + j] = Math.min(255, d[i + j] * k); };
      for (let n = 0; n < 70; n++) {
        const cy = Math.floor(rnd() * GH), cx = Math.floor(rnd() * W), s = 0.35 + cy / GH;
        const rx = (2 + rnd() * 13) * s, ry = rx * (0.25 + 0.2 * s);
        for (let y = Math.floor(cy - ry * 1.4); y <= cy + ry * 1.4; y++) {
          if (y < 0 || y >= GH) continue;
          for (let x = Math.floor(cx - rx * 1.4); x <= cx + rx * 1.4; x++) {
            const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
            if (e < 1) mul(x, y, x > cx ? 0.55 : 1.1); // inner wall: the side facing the Sun is lit
            else if (e < 1.8) mul(x, y, x > cx ? 1.2 : 0.88); // raised rim
          }
        }
      }
      g.putImageData(img, 0, 0); g.putImageData(img, W, 0);
    });
  }
  const curve = (x) => Math.round(((x - 320) / 320) ** 2 * 22);
  function drawGround(top, scroll) {
    if (!groundImg) groundImg = bakeGround();
    const off = Math.floor(scroll) % W;
    for (let x = 0; x < W; x += 4) ctx.drawImage(groundImg, x + off, 0, 4, GH, x, top + curve(x), 4, GH);
    for (let x = 0; x < W; x += 4) px(x, top + curve(x), 4, 1, '#e6e4ee'); // sunlit limb
  }

  function drawShip(x, y, t, f, flip, dep) {
    const e = f.event, dirx = flip ? -1 : 1;
    y += Math.round(Math.sin(t * 1.6) * 1.5);
    if (!shipImg) shipImg = bakeShip();
    if (e && e.kind === 'brake' && e.holding) plume(x - dirx * 47, y, dirx, t, 48);
    if (flip) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(shipImg, -SC.x, y - SC.y); ctx.restore(); }
    else ctx.drawImage(shipImg, x - SC.x, y - SC.y);
    const blink = Math.floor(t * 1.5) % 2; // nav lights on the near wing tips
    px(x - dirx * 34 - 1, y - 46, 2, 2, blink ? '#ff4d6a' : '#4a1a24');
    px(x - dirx * 34 - 1, y + 44, 2, 2, blink ? '#2a4a30' : '#4dff8a');
    // Effects on the ship.
    if (e && e.kind === 'burn' && e.holding) { // side thrusters (RCS) push the ship back toward the line
      const up = e.sign > 0 ? -1 : 1; // dev > 0 means drifted down (screen), so fire downward to push up
      for (let k = 0; k < 8; k++) px(x - 4 + Math.sin(t * 50 + k) * 2, y - up * (14 + k * 2), 3, 2, k % 2 ? '#ffb547' : '#ffffff');
      plume(x - 47, y, 1, t, 20);
    }
    if (e && e.kind === 'storm') {
      if (e.sheltered) {
        ctx.globalAlpha = 0.3 + 0.12 * Math.sin(t * 6); disc(x, y, 58, '#6fe3ff', true); ctx.globalAlpha = 1;
        for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2 + t * 0.5; px(x + Math.cos(a) * 58, y + Math.sin(a) * 58, 2, 2, i % 4 ? '#6fe3ff' : '#ffffff'); }
      } else if (Math.floor(t * 8) % 2) { ctx.globalAlpha = 0.35; px(x - 44, y - 14, 80, 28, '#ff4d6a'); ctx.globalAlpha = 1; }
    }
    if ((e && e.kind === 'meteor') || f.hull < 100) {
      px(x - 20, y - 11, 4, 2, '#3a2a2a'); px(x - 19, y - 12, 2, 1, '#1a1010'); // impact scar
      if (e && e.kind === 'meteor') { // venting gas, weaker with each patch
        const n = 10 - e.patches * 3;
        for (let k = 0; k < n; k++) { const a = (t * 2 + k / n) % 1; ctx.globalAlpha = 0.7 * (1 - a); disc(x - 18 + Math.sin(k * 3) * 4 * a, y - 14 - a * 40, Math.round(2 + a * 6), '#e6ecf6'); }
        ctx.globalAlpha = 1;
        if ((t * 3) % 1 < 0.2) for (let k = 0; k < 5; k++) px(x - 18 + Math.cos(k * 1.3) * 8, y - 14 + Math.sin(k * 1.3) * 6, 2, 2, '#ffd34d');
      }
    }
  }

  // HUD helpers: dark pixel frame with cyan corner brackets, and 5x5 gauge icons.
  function panel(x, y, w, h) {
    px(x, y, w, h, 'rgba(8,6,20,0.72)');
    px(x, y, w, 1, '#3a3460'); px(x, y + h - 1, w, 1, '#3a3460'); px(x, y, 1, h, '#3a3460'); px(x + w - 1, y, 1, h, '#3a3460');
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]]) {
      px(Math.min(cx, cx + sx * 3), cy, 4, 1, '#6fe3ff'); px(cx, Math.min(cy, cy + sy * 3), 1, 4, '#6fe3ff');
    }
  }
  const ICO = {
    fuel: ['..#..', '.###.', '#####', '#####', '.###.'],
    hull: ['#####', '#####', '#####', '.###.', '..#..'],
    crew: ['.#.#.', '#####', '#####', '.###.', '..#..'],
  };
  const ico = (rows, x, y, c) => rows.forEach((r, j) => { for (let i = 0; i < 5; i++) if (r[i] === '#') px(x + i, y + j, 1, 1, c); });

  let orbitFlight = null, orbitAt = 0;
  // f: flight state; distanceKm: real Earth-Moon distance for the trip readout.
  function drawFlight(context, t, f, distanceKm, siteName) {
    ctx = context;
    ctx.imageSmoothingEnabled = false;
    if (!nebImg) nebImg = bakeNebula();
    const e = f.event, p = f.progress, dep = !!f.departing;
    const du = dep ? Math.min(1, f.t / 3) : 1; // departure progress
    const orbit = f.status === 'orbit';
    if (orbit && orbitFlight !== f) { orbitFlight = f; orbitAt = t; }
    const ot = orbit ? t - orbitAt : 0;
    const el = e ? e.total - e.timeLeft : 0; // seconds into the current event
    let shake = 0;
    if (e && e.kind === 'meteor' && el > 0.45 && el < 0.9) shake = 4;
    if (e && e.kind === 'brake' && e.holding) shake = 1;
    const ox = shake ? Math.round((Math.random() - 0.5) * 2 * shake) : 0, oy = shake ? Math.round((Math.random() - 0.5) * 2 * shake) : 0;
    ctx.save(); ctx.translate(ox, oy);
    // Deep space: nebula, Milky Way band, three star layers streaming left (faster during the big burn).
    px(-8, -8, W + 16, H + 16, '#03020a');
    ctx.drawImage(nebImg, 0, 0);
    const speed = orbit ? 0.3 : dep ? 1 + (1 - du) * 3 : 1;
    for (const s of far) {
      const v = [3, 9, 22][s.l] * speed;
      const x = ((s.x - t * v) % W + W) % W;
      const len = speed > 2 ? 1 + Math.round(s.l * speed) : s.l === 2 ? 2 : 1;
      px(x, s.y, len, 1, s.l === 2 ? '#ffffff' : s.b > 0.6 ? '#c8c4f0' : '#6a64a0');
    }
    drawSun(e && e.kind === 'storm', t);
    // Earth: huge below the ship at departure, then falling behind on the left and shrinking.
    // Mission 4 (f.home): the same picture with the worlds swapped - the Moon behind, Earth growing ahead.
    const moonDisc = (x, y, r) => ctx.drawImage(litMoon(), Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2));
    if (dep) { const k = (1 - du) ** 2; if (f.home) moonDisc(-10 + k * 240, 170 + k * 420, 150 + k * 210); else drawEarth(-10 + k * 240, 170 + k * 420, 240, (150 + k * 210) / 240); } // one big render, scaled (smoothed)
    else if (!orbit) { const bx = Math.round(-10 - p * 160), by = Math.round(170 + p * 40), br = Math.max(10, Math.round(150 * (1 - p * 0.7))); if (f.home) moonDisc(bx, by, br); else drawEarth(bx, by, br, 1, 0.26 + p * 1.4); }
    // Moon growing ahead on the right; in orbit it fades into the close-up ground.
    const mr = Math.round(14 + Math.pow(p, 1.7) * 190);
    const mx = Math.round(600 - p * 120), my = Math.round(150 + p * 40);
    if (!orbit || ot < 1.5) {
      const r = Math.round(mr * (1 + ot * 0.8));
      if (orbit) ctx.globalAlpha = Math.max(0, 1 - ot / 1.5);
      if (f.home) drawEarth(mx, my, Math.min(150, r), r > 150 ? r / 150 : 1, 0.26 + p * 0.8); else ctx.drawImage(litMoon(), mx - r, my - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }
    const dev = e && e.kind === 'burn' ? e.dev : 0;
    const sy = SHIP.y + dev * 110;
    if (!dep && !orbit) {
      // Planned path: dotted line from the planned spot to the Moon, faint behind.
      ctx.fillStyle = 'rgba(111, 227, 255, 0.7)';
      for (let k = 0; k < 1; k += 0.02) {
        const x = SHIP.x + (mx - mr - SHIP.x) * k, y = SHIP.y + (my - SHIP.y) * k * k;
        if (Math.floor(k * 50 + t * 6) % 2 === 0) ctx.fillRect(Math.round(x), Math.round(y), 3, 2);
      }
      ctx.fillStyle = 'rgba(111, 227, 255, 0.25)';
      for (let x = 0; x < SHIP.x - 50; x += 8) ctx.fillRect(x, SHIP.y, 4, 1);
      if (e && e.kind === 'burn') { // predicted path from where the ship really is: bends away while off course
        ctx.fillStyle = Math.abs(dev) < 0.08 ? '#4dffc3' : '#ffd34d';
        for (let k = 0.08; k < 1; k += 0.025) {
          const x = SHIP.x + (mx - mr - SHIP.x) * k, y = sy + (my - sy) * k * k + dev * 260 * k * k;
          if (Math.floor(k * 40 - t * 8) % 2 === 0) ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
        }
      }
    }
    if (orbit) { // low orbit: the ground rises into view and Earth rises over the horizon
      const rise = Math.min(1, ot / 2.5), top = Math.round(360 - (1 - (1 - rise) ** 2) * 120);
      const er = Math.min(1, Math.max(0, (ot - 1.5) / 5));
      drawEarth(520, top + 12 - er * 42, 14);
      drawGround(top, ot * 30);
    }
    // Storm wave from the Sun, meteors tumbling past.
    if (e && e.kind === 'storm') {
      for (let i = 0; i < 160; i++) { const x = W - ((i * 53 + t * 380) % (W + 60)), y = (i * 97) % H; px(x, y, 8, 1, i % 4 ? 'rgba(255,170,80,0.8)' : '#ffe2a0'); }
      ctx.fillStyle = 'rgba(255, 120, 40, 0.1)'; ctx.fillRect(0, 0, W, H);
    }
    if (e && e.kind === 'meteor') {
      for (let i = 0; i < 6; i++) {
        const k = (t * 0.8 + i * 0.37) % 1, x = W + 40 - k * (W + 120), y = 30 + ((i * 71) % 200) + k * 60, s = [6, 10, 14][i % 3];
        px(x + s, y + s / 2, 14, 1, 'rgba(255,200,140,0.45)');
        ctx.drawImage(rock(s, Math.floor(t * 8 + i) % 8), Math.round(x), Math.round(y));
      }
      if (el < 0.45) { // the one that hits us
        const u = el / 0.45, x = W + 20 + (SHIP.x - 26 - W - 20) * u, y = 40 + (sy - 22 - 40) * u;
        px(x + 16, y + 8, 30, 2, 'rgba(255,200,140,0.6)');
        ctx.drawImage(rock(16, Math.floor(t * 12) % 8), Math.round(x), Math.round(y));
      }
    }
    drawShip(SHIP.x, Math.round(sy), t, f, !!(e && e.kind === 'brake'), dep);
    if (e && e.kind === 'meteor' && el > 0.45 && el < 0.65) { ctx.fillStyle = `rgba(255,240,220,${((0.65 - el) / 0.2) * 0.7})`; ctx.fillRect(-8, -8, W + 16, H + 16); }
    ctx.restore();

    // ---- HUD ----
    const T = (txt, x, y, c, sc = 1, al = 'left') => PixelText.draw(ctx, txt, x, y, c, sc, al);
    // Gauges, top-left.
    panel(6, 6, 156, 56);
    const bar = (y, key, label, v, col) => {
      ico(ICO[key], 12, y + 1, col); T(label, 21, y, '#8a84b0');
      px(54, y + 1, 70, 5, '#1e1a2a'); px(54, y + 1, 70 * Math.max(0, Math.min(1, v / 100)), 5, col);
      T(`${Math.max(0, Math.round(v))}`, 154, y, '#c8c4f0', 1, 'right');
    };
    bar(12, 'fuel', 'FUEL', f.fuel, f.fuel < 15 ? '#ff4d6a' : '#ff9a3d');
    bar(24, 'hull', 'HULL', f.hull, f.hull < 40 ? '#ff4d6a' : '#6fe3ff');
    bar(36, 'crew', 'CREW', f.health, f.health < 40 ? '#ff4d6a' : '#4dffc3');
    T(`DOSE ${f.dose.toFixed(1)} mGy`, 12, 49, e && e.kind === 'storm' && !e.sheltered ? '#ffb070' : '#8a84b0');
    // Mission clock and speed.
    panel(6, 66, 156, tex.cloudDate ? 44 : 32);
    const kms = dep ? 7.8 + 3.1 * du : orbit ? 1.63 : e && e.kind === 'brake' ? 0.6 + e.speed * 1.5 : Moon.speedKms(p);
    T(`MET ${dep ? '0d 00:00' : Moon.missionClock(p)}`, 12, 72, '#c8c4f0');
    T(`SPEED ${kms.toFixed(2)} KM/S`, 12, 85, '#c8c4f0');
    if (tex.clouds && tex.cloudDate) T(`NASA CLOUDS ${tex.cloudDate}`, 12, 98, '#6a64a0'); // real clouds on Earth from that day
    // Trip bar: Earth to Moon with the ship marker.
    const bx = 196, bw = 228;
    panel(176, 6, 268, 36);
    px(bx, 14, bw, 4, '#1e1a2a'); px(bx, 14, bw * p, 4, '#6fe3ff');
    disc(bx - 8, 16, 5, f.home ? '#a8a6b0' : '#3a7bd5'); disc(bx + bw + 8, 16, 5, f.home ? '#3a7bd5' : '#a8a6b0'); // from / to
    px(bx - 2 + bw * p, 10, 4, 12, '#ffffff');
    T(`DAY ${(p * 3).toFixed(1)} OF 3`, bx, 26, '#8a84b0');
    T(`${Math.round(((1 - p) * (distanceKm || 384400)) / 1000)}K KM TO GO`, bx + bw, 26, '#8a84b0', 1, 'right');
    if (siteName) T(`TARGET: ${siteName.toUpperCase()}`, 310, 46, '#6a64a0', 1, 'center');
    // Event banner with a timer ring.
    const cx = 310;
    if (dep) {
      T(f.home ? 'GOODBYE, MOON' : 'GOODBYE, EARTH', cx, 58, '#6fe3ff', 2, 'center');
      T(f.home ? 'ON OUR WAY HOME. EARTH IS 384,400 KM AWAY.' : 'UPPER STAGE SEPARATED. SOLAR WINGS OPEN.', cx, 78, '#8a84b0', 1, 'center');
      drawEpicAt(ctx, 560, 196, 60);
    } else if (e) {
      const label = { burn: 'COURSE CORRECTION', storm: 'SOLAR PARTICLE STORM', meteor: 'MICROMETEOROID IMPACT', brake: 'LUNAR ORBIT INSERTION' }[e.kind];
      const col = { burn: '#ffd34d', storm: '#ff9a3d', meteor: '#ff4d6a', brake: '#4dffc3' }[e.kind];
      if (Math.floor(t * 3) % 4) T(label, cx, 58, col, 2, 'center');
      if (e.kind === 'storm' && e.flare) T(`MODELLED ON A REAL ${e.flare.classType} FLARE, ${e.flare.date} (NASA DONKI)`, cx, 102, '#ffb070', 1, 'center');
      if (e.kind === 'meteor' && f.asteroid) T(`REAL ROCKS: ASTEROID ${f.asteroid.name} PASSED ${Math.round(f.asteroid.km / 1000)}K KM FROM EARTH`, cx, 102, '#ff9aaa', 1, 'center');
      for (let i = 0; i < 40; i++) {
        const a = -Math.PI / 2 + (i / 40) * Math.PI * 2;
        px(cx + Math.cos(a) * 10, 86 + Math.sin(a) * 10, 1, 1, i / 40 < e.timeLeft / e.total ? col : '#2a2440');
      }
      T(`${Math.ceil(e.timeLeft)}`, cx, 83, col, 1, 'center');
      if (e.kind === 'burn') {
        const good = Math.abs(e.dev) < 0.08;
        T(good ? 'ON TARGET: LET GO' : e.holding ? 'BURNING...' : 'OFF COURSE: HOLD BURN', cx, 102, good ? '#4dffc3' : '#ffd34d', 1, 'center');
      }
      if (e.kind === 'brake') { // speed meter with the green capture zone
        const C = Moon.CAPTURE, mx0 = 200, mw = 220;
        panel(190, 100, 240, 32);
        T('SLOW', mx0, 103, '#8a84b0'); T('FAST', mx0 + mw, 103, '#8a84b0', 1, 'right');
        T('CAPTURE', mx0 + ((C.lo + C.hi) / 2) * mw, 103, '#4dffc3', 1, 'center');
        px(mx0, 113, mw, 5, '#1e1a2a');
        px(mx0, 113, (C.lo - 0.15) * mw, 5, '#5a1a24');
        px(mx0 + C.lo * mw, 113, (C.hi - C.lo) * mw, 5, '#2a8a5a');
        px(mx0 + C.lo * mw, 112, 1, 7, '#4dffc3'); px(mx0 + C.hi * mw, 112, 1, 7, '#4dffc3');
        px(mx0 + e.speed * mw - 1, 110, 3, 11, '#ffffff');
        const inZone = e.speed >= C.lo && e.speed <= C.hi;
        T(inZone ? 'IN THE GREEN: LET GO' : e.speed > C.hi ? 'TOO FAST: HOLD BRAKE' : 'TOO SLOW', cx, 122, inZone ? '#4dffc3' : '#ffd34d', 1, 'center');
      }
    } else if (orbit) {
      T('LUNAR ORBIT', cx, 58, '#4dffc3', 2, 'center');
      if (ot > 2) T('110 KM ABOVE THE SURFACE', cx, 78, '#8a84b0', 1, 'center');
    } else if (f.status === 'lost' || f.status === 'lowfuel') {
      if (Math.floor(t * 2) % 2) T('MISSION ABORTED', cx, 58, '#ff4d6a', 2, 'center');
    }
  }

  // For the landing screen: the same real Earth and HUD frames, drawn into another context.
  const withCtx = (fn) => (context, ...args) => { const saved = ctx; ctx = context; fn(...args); ctx = saved; };
  const drawEarthAt = withCtx((x, y, r) => drawEarth(x, y, r, 1, 0.26));
  const hudPanel = withCtx(panel);
  // Today's real photo of the whole Earth (NASA EPIC on DSCOVR), in a small framed window.
  let epic = null;
  const setEpic = (img, date) => { epic = { img, date }; };
  const drawEpicAt = withCtx((x, y, size, label = true) => {
    if (!epic) return;
    panel(x - 6, y - 6, size + 12, size + (label ? 30 : 12));
    ctx.imageSmoothingEnabled = true; // a photo, scaled down: keep it smooth
    ctx.drawImage(epic.img, x, y, size, size);
    ctx.imageSmoothingEnabled = false;
    if (label && typeof PixelText !== 'undefined') { PixelText.draw(ctx, 'EARTH TODAY', x + size / 2, y + size + 4, '#6fe3ff', 1, 'center'); PixelText.draw(ctx, epic.date, x + size / 2, y + size + 13, '#6a64a0', 1, 'center'); } // photo: NASA EPIC (credited in the footer and the panel title)
  });
  const drawMoonAt = withCtx((x, y, r) => ctx.drawImage(litMoon(), Math.round(x - r), Math.round(y - r), r * 2, r * 2));

  return { shipSprite: () => shipImg || (shipImg = bakeShip()), SHIP_ORIGIN: SC, drawMap, siteAt, project, icon, drawFlight, setEarthMap, drawEarthAt, drawMoonAt, hudPanel, setEpic, drawEpicAt, prepareEarth, warmUp, W, H };
})();

if (typeof module !== 'undefined') module.exports = MoonRender;
