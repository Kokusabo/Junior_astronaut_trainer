// Launch pad scene, drawn from code shapes on a 640x360 canvas (scaled with pixelated CSS).
// Reads game state, never changes it. lampState is pure so Node can test it.
const Render = (function () {
  const W = 640, H = 360;
  const RX = 340, BASE = 292; // rocket centre x and engine base y
  const HZ = 248;             // horizon line (far shore); the river runs from here to the pad

  // Status light per system: off (not in this level), unknown (not checked), verify (repaired, needs re-check), ok, fail, repair.
  function lampState(id, s) {
    const st = s.systems[id];
    if (!st) return 'off';
    if (s.active === id) return s.repair ? 'repair' : 'fail';
    return { unchecked: 'unknown', repaired: 'verify', ok: 'ok' }[st];
  }

  // Fixed pseudo-random numbers so stars, gravel and windows do not jump between frames.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = [];
  for (let i = 0; i < 120; i++) stars.push({ x: Math.floor(rnd() * W), y: Math.floor(rnd() * 130), tw: rnd() });

  let ctx;
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  // Pixel-perfect filled circle (row by row, no anti-aliasing). dither = checkerboard for soft glows.
  function disc(cx, cy, r, c, dither) {
    ctx.fillStyle = c;
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r - dy * dy));
      if (!dither) { ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2 + 1, 1); continue; }
      for (let dx = -half; dx <= half; dx++) if ((dx + dy) & 1) ctx.fillRect(Math.round(cx + dx), Math.round(cy + dy), 1, 1);
    }
  }
  // 1px Bresenham line, for lattice braces and cables.
  function line(x0, y0, x1, y1, c) {
    ctx.fillStyle = c;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // Sprite cache: parts that rarely change are drawn once into an offscreen canvas and reused with
  // drawImage, instead of thousands of fillRects every frame. Keys include colours, so a new time of day
  // or weather makes new sprites; the cache is emptied if it grows large (e.g. during a timelapse).
  const sprites = new Map();
  function sprite(key, w, h, draw) {
    let c = sprites.get(key);
    if (!c) {
      if (sprites.size > 240) sprites.clear();
      c = document.createElement('canvas');
      c.width = w; c.height = h;
      const saved = ctx;
      ctx = c.getContext('2d');
      draw();
      ctx = saved;
      sprites.set(key, c);
    }
    return c;
  }
  const q = (v, step = 0.1) => Math.round(v / step) * step; // quantise blend weights so keys repeat

  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => {
    const A = hex(a), B = hex(b);
    return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
  };

  // ---------- Sky, sun/moon and far shore, for any time of day ----------
  // Four palettes (top of sky to horizon), blended by the hour. Each sky and shore is baked once.
  const PAL = {
    night: { sky: ['#04020c', '#060312', '#080418', '#0a061e', '#0c0824', '#0f0a2a', '#120c30', '#160f36', '#1a123c', '#1e1542', '#231848', '#2a1c4e'],
      shore: '#07051a', bld: '#0e0a26', lit: '#ffcf6b', sea: ['#1c1440', '#0a0618'], cloud: '#1c1638', ground: ['#100c22', '#08060f'], grass: '#16122a' },
    dawn: { sky: ['#1c1440', '#2a1a52', '#3c2264', '#542a72', '#70347c', '#904082', '#b04e84', '#cc6082', '#e07a80', '#ee9a82', '#f6b888', '#fcd290'],
      shore: '#2a1838', bld: '#352044', lit: '#ffcf6b', sea: ['#c07a8a', '#3a2048'], cloud: '#8a4a7a', ground: ['#3a2440', '#22142c'], grass: '#4a3048' },
    day: { sky: ['#2a5ab0', '#2e62b8', '#346cc0', '#3a76c8', '#4280d0', '#4a8ad6', '#5494dc', '#5e9ee0', '#6aa8e4', '#78b2e8', '#88bcea', '#9cc8ec'],
      shore: '#2c3a4e', bld: '#3e4c62', lit: '#9cc8ec', sea: ['#6aa0d0', '#2a4a78'], cloud: '#e6ecf6', ground: ['#4e5a46', '#2e3a2e'], grass: '#5e7a4a' },
    dusk: { sky: ['#140828', '#1c0b36', '#260e44', '#331250', '#45175a', '#5c1d62', '#782566', '#963066', '#b53e62', '#d4505a', '#ee6a50', '#ff8a4a'],
      shore: '#2a0f35', bld: '#331240', lit: '#ffcf6b', sea: ['#7a3a5e', '#2e1640'], cloud: '#5a2462', ground: ['#2c1a3a', '#1a0e26'], grass: '#3a2448' },
  };
  const SKY = PAL.dusk.sky; // used by the night fade above the backdrop during liftoff
  // Hour -> two palettes and a blend weight. Launches happen at dusk (18:30).
  const ANCHORS = [[0, 'night'], [5, 'night'], [6.5, 'dawn'], [9, 'day'], [16, 'day'], [18.5, 'dusk'], [20, 'night'], [24, 'night']];
  function palettesAt(h) {
    h = ((h % 24) + 24) % 24;
    for (let i = 0; i < ANCHORS.length - 1; i++) {
      const [h0, a] = ANCHORS[i], [h1, b] = ANCHORS[i + 1];
      if (h >= h0 && h <= h1) return { a, b, k: h1 === h0 ? 0 : (h - h0) / (h1 - h0) };
    }
    return { a: 'night', b: 'night', k: 0 };
  }

  const baked = {};
  function withCanvas(draw) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const saved = ctx;
    ctx = c.getContext('2d');
    draw();
    ctx = saved;
    return c;
  }
  function bakeSky(name) {
    return withCanvas(() => {
      const pal = PAL[name].sky;
      // 22 bands interpolated from the palette, with a 2-row checker dither on every seam.
      const bands = 22, bandH = HZ / bands;
      const colorAt = (i) => { const f = (i / (bands - 1)) * (pal.length - 1); const k = Math.min(pal.length - 2, Math.floor(f)); return mix(pal[k], pal[k + 1], f - k); };
      for (let i = 0; i < bands; i++) px(0, i * bandH, W, bandH + 1, colorAt(i));
      px(0, HZ, W, H - HZ, pal[pal.length - 1]);
      for (let i = 1; i < bands; i++) {
        const y = Math.round(i * bandH);
        ctx.fillStyle = colorAt(i);
        for (let x = 0; x < W; x += 2) ctx.fillRect(x + (i & 1), y - 2, 1, 1);
        ctx.fillStyle = colorAt(i - 1);
        for (let x = 0; x < W; x += 2) ctx.fillRect(x + ((i + 1) & 1), y + 1, 1, 1);
      }
    });
  }
  function bakeShore(name) {
    return withCanvas(() => {
      const { shore, bld, lit } = PAL[name];
      seed = 5;
      px(0, HZ - 10, W, 12, shore);
      for (let x = 0; x < W; x += 4) px(x, HZ - 14 + Math.floor(rnd() * 5), 4, 6, shore);
      const building = (x, w, h, n) => {
        px(x, HZ - h, w, h, bld); px(x, HZ - h, 2, h, mix(bld, '#ffffff', 0.08));
        for (let k = 0; k < n; k++) px(x + 4 + Math.floor(rnd() * (w - 8)), HZ - h + 4 + Math.floor(rnd() * (h - 10)), 2, 2, lit);
      };
      building(380, 26, 22, 3); building(410, 16, 30, 2); building(560, 30, 18, 3);
      // Big assembly building: tall box, lighter sunlit face, vertical door slot, a few lit windows.
      px(470, HZ - 76, 76, 76, bld); px(470, HZ - 76, 10, 76, mix(bld, '#ffffff', 0.1)); px(470, HZ - 76, 76, 3, mix(bld, '#ffffff', 0.15));
      px(500, HZ - 64, 14, 64, shore); for (let y = HZ - 60; y < HZ - 4; y += 6) px(501, y, 12, 1, bld);
      for (let k = 0; k < 7; k++) px(484 + Math.floor(rnd() * 56), HZ - 68 + Math.floor(rnd() * 56), 2, 2, lit);
      px(596, HZ - 50, 6, 50, bld); px(588, HZ - 58, 22, 10, bld); px(588, HZ - 58, 22, 2, mix(bld, '#ffffff', 0.12)); // water tower
      const palm = (x, h) => {
        for (let k = 0; k < h; k++) px(x + Math.round(Math.sin(k / h * 1.6) * 4), HZ - k, 2, 1, shore);
        const tx = x + Math.round(Math.sin(1.6) * 4), ty = HZ - h;
        for (const [dx, dy] of [[-10, 4], [10, 4], [-7, -3], [7, -3], [0, -5]]) line(tx, ty, tx + dx, ty + dy, shore);
      };
      palm(30, 24); palm(52, 30); palm(612, 26);
    });
  }
  function bakedLayer(kind, name) {
    const key = `${kind}:${name}`;
    if (!baked[key]) baked[key] = kind === 'sky' ? bakeSky(name) : bakeShore(name);
    return baked[key];
  }
  function blendLayers(kind, p) {
    ctx.drawImage(bakedLayer(kind, p.a), 0, 0);
    if (p.k > 0 && p.a !== p.b) { ctx.globalAlpha = p.k; ctx.drawImage(bakedLayer(kind, p.b), 0, 0); ctx.globalAlpha = 1; }
  }
  const nightness = (p) => (p.a === 'night' ? 1 - p.k : 0) + (p.b === 'night' ? p.k : 0);

  // Sun above the horizon from 06:00 to 18:50, along an arc from east (right) to west (left).
  function sunAt(h) {
    const f = (h - 6) / 12.85;
    if (f < 0 || f > 1) return null;
    return { x: 600 - 500 * f, y: HZ + 10 - Math.sin(Math.PI * f) * 230, low: 1 - Math.sin(Math.PI * f) };
  }
  function sunAndMoon(h, env) {
    const sun = sunAt(h);
    if (sun) {
      const glow = sun.low > 0.6;
      const img = sprite(`sun:${glow}`, 128, 128, () => {
        if (glow) disc(64, 64, 62, '#ff9a5a', true);
        disc(64, 64, glow ? 44 : 34, glow ? '#ffa868' : '#fff2c0');
        disc(64, 64, glow ? 30 : 24, glow ? '#ffe2a0' : '#fffbe8');
        if (glow) for (let k = 0; k < 5; k++) px(32, 74 + k * 5, 64, 1 + Math.floor(k / 2), '#ffa868'); // sliced sunset
      });
      ctx.drawImage(img, Math.round(sun.x) - 64, Math.round(sun.y) - 64);
    }
    const mh = ((h - 19.5 + 24) % 24) / 10; // moon up 19:30 to 05:30
    if (mh <= 1) {
      const mx = 560 - 480 * mh, my = HZ - 20 - Math.sin(Math.PI * mh) * 200;
      disc(mx, my, 12, '#e8e4d8'); px(mx - 5, my - 3, 3, 3, '#c8c4b8'); px(mx + 3, my + 2, 4, 3, '#c8c4b8');
    }
  }

  function sky(t, env) {
    const p = palettesAt(env.hour);
    blendLayers('sky', p);
    const night = nightness(p);
    // Stars fade in at night; at dusk only the darkest upper sky shows a few.
    const starLimit = night > 0.3 ? 250 : env.hour > 17 || env.hour < 7 ? 120 : 0;
    for (const st of stars) {
      if (st.y > starLimit || Math.sin(t * 2 + st.tw * 20) < -0.4) continue;
      if (st.tw > 0.93) { px(st.x - 1, st.y, 3, 1, '#ffffff'); px(st.x, st.y - 1, 1, 3, '#ffffff'); }
      else px(st.x, st.y, 1, 1, st.tw > 0.6 ? '#ffffff' : '#d8a8e8');
    }
    sunAndMoon(env.hour, env);
    // Overcast dims the sky before the shore goes on top.
    const over = OVERCAST[env.kind] || 0;
    if (over) { ctx.fillStyle = `rgba(60, 54, 80, ${over * 0.6})`; ctx.fillRect(0, 0, W, H); }
  }
  const OVERCAST = { sun: 0, cloud: 0.3, wind: 0.2, cold: 0.15, rain: 0.6, storm: 0.85 };

  // Sky above the baked backdrop, revealed when the camera follows the rocket up: fades to night.
  function space(t, h) {
    for (let y = 0; y < h; y += 4) {
      const k = Math.min(1, (h - y) / 360); // 0 at the backdrop's top edge, 1 high above it
      px(0, y, W, 4, mix(SKY[0], '#04020a', k));
    }
    for (const st of stars) for (let tile = 1; tile * 130 <= h + 130; tile++) {
      const yy = h - tile * 130 + st.y;
      if (yy < 0 || yy >= h) continue;
      if (Math.sin(t * 2 + st.tw * 20 + tile) < -0.4) continue;
      px(st.x, yy, 1, 1, st.tw > 0.7 ? '#ffffff' : '#b8a8e8');
    }
  }

  // River between the far shore and the pad: sky-coloured gradient, a wobbling mirror image of the
  // shore (with its lit windows), drifting ripples, a broken sun/moon path, and rain rings.
  const RIPPLES = [];
  seed = 300;
  for (let i = 0; i < 70; i++) RIPPLES.push({ x: rnd() * W, y: HZ + 4 + Math.floor(rnd() * (284 - HZ)), len: 4 + Math.floor(rnd() * 14), v: 2 + rnd() * 6 });
  function water(t, env) {
    const p = palettesAt(env.hour);
    const top = mix(PAL[p.a].sea[0], PAL[p.b].sea[0], p.k), bot = mix(PAL[p.a].sea[1], PAL[p.b].sea[1], p.k);
    const y0 = HZ + 2, y1 = 289, depth = y1 - y0;
    for (let y = y0; y < y1; y++) px(0, y, W, 1, mix(top, bot, (y - y0) / depth));
    // Mirror image of the shore: each water row copies a row of the shore, flipped, with a wave offset.
    const shore = bakedLayer('shore', p.k < 0.5 ? p.a : p.b);
    ctx.globalAlpha = 0.45;
    for (let y = y0; y < y1; y++) {
      const sy = Math.round(HZ - (y - y0) * 1.6);
      const wob = Math.round(Math.sin(t * 2.2 + y * 0.9) * (1 + (y - y0) / 8));
      ctx.drawImage(shore, 0, sy, W, 1, wob, y, W, 1);
    }
    ctx.globalAlpha = 1;
    // Shine along the far edge.
    px(0, y0, W, 1, mix(top, '#ffffff', 0.35));
    // Ripples: short highlights drifting with the current, longer near the viewer.
    const glint = mix(top, '#ffffff', 0.4);
    for (const r of RIPPLES) {
      const x = ((r.x + t * r.v) % (W + 30)) - 15;
      const near = (r.y - y0) / depth;
      px(x, r.y, Math.round(r.len * (0.6 + near)), 1, glint);
      if (near > 0.6) px(x + 3, r.y + 1, Math.round(r.len * 0.5), 1, mix(bot, '#000000', 0.2));
    }
    // Sun (or moon) path: broken, shimmering bands under a low sun or the moon.
    const sun = sunAt(env.hour);
    const over = OVERCAST[env.kind] || 0;
    if (over < 0.5 && sun && sun.low > 0.45) {
      for (let y = y0 + 2; y < y1; y += 2) {
        const w = Math.max(3, 70 - (y - y0) * 1.8 + Math.sin(t * 3 + y) * 8);
        const seg = 3 + Math.floor(Math.abs(Math.sin(y * 1.7 + t * 4)) * 4);
        for (let k = 0; k < seg; k++) {
          const sx = sun.x - w / 2 + (k + 0.5) * (w / seg) + Math.sin(t * 2 + y + k) * 3;
          px(sx - 3, y, 5 + ((y + k) % 3), 1, (y + k) % 4 ? '#ffb070' : '#ffe2a0');
        }
      }
    } else if (nightness(p) > 0.5) {
      const mh = ((env.hour - 19.5 + 24) % 24) / 10;
      if (mh <= 1) { const mx = 560 - 480 * mh; for (let y = y0 + 2; y < y1; y += 3) px(mx - 6 + Math.sin(t * 2 + y) * 3, y, 10 - (y - y0) / 4, 1, '#c8c4b8'); }
    }
    // Rain rings expanding on the surface.
    if (env.kind === 'rain' || env.kind === 'storm') {
      for (let i = 0; i < 24; i++) {
        const ph = (t * 1.5 + i * 0.37) % 1;
        const rx = (i * 137.5) % W, ry = y0 + 3 + (i * 7) % (depth - 4);
        const rw = Math.round(2 + ph * 10);
        ctx.globalAlpha = 0.6 * (1 - ph);
        px(rx - rw, ry, 2, 1, '#e6ecf6'); px(rx + rw - 2, ry, 2, 1, '#e6ecf6'); px(rx - rw + 2, ry - 1, rw * 2 - 4, 1, '#e6ecf6');
        ctx.globalAlpha = 1;
      }
    }
  }

  // Rain streaks slanted by the wind; storms add lightning flashes with a forked bolt.
  function precipitation(t, env) {
    if (env.kind !== 'rain' && env.kind !== 'storm') return;
    const n = env.kind === 'storm' ? 220 : 120;
    const slant = Math.min(10, env.wind || 3);
    ctx.fillStyle = 'rgba(200, 210, 240, 0.45)';
    for (let i = 0; i < n; i++) {
      const x = ((i * 97.3 + t * 40 * slant) % (W + 40)) - 20;
      const y = ((i * 53.7 + t * 520) % (H + 20)) - 20;
      for (let k = 0; k < 3; k++) ctx.fillRect(Math.round(x + k * slant * 0.3), Math.round(y + k * 4), 1, 4);
    }
    if (env.kind === 'storm') {
      const cycle = t * 0.7, phase = cycle % 3;
      if (phase < 0.12) {
        ctx.fillStyle = `rgba(230, 230, 255, ${0.5 - phase * 3})`; ctx.fillRect(0, 0, W, H);
        let bx = 80 + ((Math.floor(cycle / 3) * 211) % 480), by = 0;
        while (by < HZ) { const nx = bx + ((by * 7) % 23) - 11; line(bx, by, nx, by + 18, '#ffffff'); line(bx + 1, by, nx + 1, by + 18, '#c8d0ff'); bx = nx; by += 18; }
      }
    }
  }

  // Wind sock on the tower top: stiff and horizontal in strong wind, limp when calm.
  function windsock(t, env) {
    const wind = env.wind || 2;
    const lift = Math.min(1, wind / 10);
    const ang = Math.PI / 2 - lift * (Math.PI / 2 - 0.15) + Math.sin(t * (2 + wind)) * 0.08 * lift;
    const x0 = 228, y0 = 50;
    px(x0 - 1, y0, 2, 16, '#5c6274');
    for (let k = 0; k < 5; k++) {
      const r = 3 + k * 4;
      px(x0 - Math.sin(ang) * r - 2, y0 + Math.cos(ang) * r - 2, 4, 4, k % 2 ? '#ffffff' : '#ff6a3a');
    }
  }

  function ground(env) {
    const p = palettesAt(env.hour);
    const kq = q(p.k);
    const dark = q(nightness(p) + (env.hour > 17 && env.hour < 20 ? 0.5 : 0));
    ctx.drawImage(sprite(`ground:${p.a}:${p.b}:${kq}:${dark}`, W, H, () => groundStatic({ a: p.a, b: p.b, k: kq }, dark)), 0, 0);
  }
  function groundStatic(p, dark) {
    const g0 = mix(PAL[p.a].ground[0], PAL[p.b].ground[0], p.k), g1 = mix(PAL[p.a].ground[1], PAL[p.b].ground[1], p.k);
    const grass = mix(PAL[p.a].grass, PAL[p.b].grass, p.k);
    for (let y = 290; y < H; y += 2) px(0, y, W, 2, mix(g0, g1, (y - 290) / (H - 290)));
    seed = 11;
    for (let i = 0; i < 320; i++) px(Math.floor(rnd() * W), 292 + Math.floor(rnd() * 68), 2, 1, i % 3 ? mix(g0, '#ffffff', 0.06) : mix(g1, '#000000', 0.2));
    // Shoreline: grass tufts and reeds along the water's edge.
    px(0, 288, W, 3, grass);
    for (let x = 2; x < W; x += 5) { const h = 2 + Math.floor(rnd() * 5); px(x, 289 - h, 1, h, grass); if (h > 4) px(x + 1, 287 - h, 1, 2, mix(grass, '#ffffff', 0.15)); }
    // Pools of light under the floodlights at dusk and night.
    if (dark > 0.2) for (const x of [60, 600]) {
      ctx.globalAlpha = Math.min(0.5, dark * 0.4);
      for (let r = 0; r < 3; r++) { ctx.fillStyle = '#fff2c4'; for (let dx = -60 + r * 12; dx <= 60 - r * 12; dx += 2) ctx.fillRect(x + dx + (r & 1), 292 + r * 3, 1, 6 - r); }
      ctx.globalAlpha = 1;
    }
    // Crawler road: gravel strip widening toward the viewer, with edge lines.
    for (let y = 316; y < H; y++) {
      const half = 26 + (y - 316) * 1.4;
      px(RX - half, y, half * 2, 1, mix(g0, '#8a7a9a', 0.25));
      px(RX - half, y, 2, 1, mix(g0, '#ffffff', 0.25)); px(RX + half - 2, y, 2, 1, mix(g0, '#ffffff', 0.25));
      if (y % 3 === 0) for (let x = RX - half + (y % 6); x < RX + half; x += 7) px(x, y, 1, 1, mix(g0, '#ffffff', 0.18));
    }
    // Fence posts along the pad perimeter.
    for (let x = 150; x < 196; x += 9) { px(x, 296, 2, 10, '#3a3046'); }
    for (let x = 486; x < 540; x += 9) { px(x, 296, 2, 10, '#3a3046'); }
    px(150, 299, 46, 1, '#5a4a66'); px(486, 299, 54, 1, '#5a4a66');
    // Pad: top surface, edge highlight, hazard-striped front, flame trench opening.
    px(196, 290, 288, 10, '#6a5a7a'); px(196, 290, 288, 1, '#a48eb0');
    for (let x = 206; x < 480; x += 24) px(x, 292, 1, 7, '#5a4a6a'); // concrete slab joints
    px(196, 300, 288, 18, '#3e3050');
    for (let x = 196; x < 484; x += 8) for (let k = 0; k < 4; k++) px(x + k, 300 + k, 4, 1, '#e8b030');
    px(196, 304, 288, 1, '#2a1f38');
    px(310, 300, 60, 18, '#0e0816'); px(310, 300, 60, 2, '#241a30');
    // Hold-down posts, plumbing and a propellant tank on the pad.
    px(RX - 26, 282, 6, 8, '#8a7a96'); px(RX + 20, 282, 6, 8, '#6a5a7a');
    px(222, 280, 4, 10, '#4a3a5a'); px(214, 276, 20, 4, '#5a4a6a');
    px(430, 268, 30, 22, '#c8c0d0'); px(430, 268, 30, 3, '#ece6f0'); px(456, 268, 4, 22, '#9a90a8'); // spherical-ish tank
    px(434, 262, 22, 6, '#c8c0d0'); px(440, 258, 10, 4, '#c8c0d0');
    px(420, 284, 12, 2, '#5a4a6a');
  }

  // Light towers with lamp heads; beams sweep slowly across the rocket.
  function floodlights(t) {
    [60, 600].forEach((x, i) => {
      const aim = RX + Math.sin(t * 0.5 + i * 2) * 52;
      ctx.fillStyle = 'rgba(255, 236, 190, 0.06)';
      ctx.beginPath(); ctx.moveTo(x, 168); ctx.lineTo(aim - 44, BASE); ctx.lineTo(aim + 44, BASE); ctx.closePath(); ctx.fill();
      px(x - 2, 168, 4, 122, '#2b2440'); px(x - 2, 168, 1, 122, '#3e3656');
      for (let y = 180; y < 290; y += 14) px(x - 4, y, 8, 1, '#2b2440');
      px(x - 9, 160, 18, 9, '#3a3454'); px(x - 9, 160, 18, 1, '#5a5274');
      for (let k = 0; k < 3; k++) px(x - 7 + k * 5, 162, 4, 4, '#fff2c4');
    });
  }

  // Clouds: puffy cumulus built from a few overlapping puffs with a flat base, shaded top to bottom
  // (bright top, body, darker base). Low sun lights the base. Far layer: small, faint, slow.
  const CLOUD_SHAPES = [];
  for (let i = 0; i < 12; i++) {
    seed = 101 + i * 7;
    const w = 90 + Math.floor(rnd() * 80);
    const puffs = [];
    // Puffs grow toward the middle so each cloud has a rounded, piled-up top.
    for (let x = 10; x < w - 10; x += 12 + Math.floor(rnd() * 8)) {
      const mid = 1 - Math.abs(x / w - 0.5) * 2;
      puffs.push([x, Math.round(8 + mid * 12 + rnd() * 5)]);
    }
    CLOUD_SHAPES.push({ w, puffs });
  }
  // Cloud sprite: origin 6 px in from the left and 50 px down from the top (the cloud's flat base line).
  function cloudSprite(index, body, top, base, lit) {
    const shape = CLOUD_SHAPES[index];
    return sprite(`cloud:${index}:${body}:${top}:${base}:${lit}`, shape.w + 12, 56, () => cloudShape(6, 50, shape, body, top, base, lit));
  }
  function cloudShape(x, y, shape, body, top, base, lit) {
    const { w, puffs } = shape;
    for (const [cx, r] of puffs) disc(x + cx, y - r * 0.6, r, base);           // base shadow
    for (const [cx, r] of puffs) disc(x + cx, y - r * 0.6 - 2, r - 1, body);   // body
    for (const [cx, r] of puffs) disc(x + cx - 2, y - r * 0.6 - 4, Math.max(2, r - 5), top); // highlight
    px(x + 2, y - 2, w - 4, 4, base);                                         // flat bottom
    px(x + 4, y + 2, w - 8, 1, lit);                                          // underside light
  }
  function clouds(t, env, layerIndex, flight) {
    const over = OVERCAST[env.kind] || 0;
    const far = layerIndex === 0;
    const n = (far ? 4 : 3) + Math.round(over * (far ? 3 : 5));
    const speed = (far ? 0.5 : 1) * (1 + Math.min(3, (env.wind || 2) / 4));
    const p = palettesAt(env.hour);
    const tint = mix(PAL[p.a].cloud, PAL[p.b].cloud, q(p.k));
    const body = mix(tint, '#4a4a5c', over);
    const top = mix(body, '#ffffff', far ? 0.12 : 0.28), base = mix(body, '#000000', 0.25);
    const sun = sunAt(env.hour);
    const lit = sun && sun.low > 0.6 && over < 0.5 ? '#ff9a7a' : mix(body, '#ffffff', 0.1);
    if (far) ctx.globalAlpha = 0.7;
    for (let i = 0; i < n; i++) {
      const index = (i * 5 + (far ? 3 : 0)) % CLOUD_SHAPES.length;
      const shape = CLOUD_SHAPES[index];
      const w = shape.w * (far ? 0.7 : 1);
      const x = ((t * (3 + (i % 4) * 1.4) * speed + i * 211 + (far ? 97 : 0)) % (W + w * 2)) - w;
      // In flight the near clouds start above the screen and sweep down past the climbing rocket.
      const y = far ? 50 + (i * 29) % 70 : flight ? -160 - i * 170 : 110 + (i * 47) % 90;
      const img = cloudSprite(index, body, top, base, lit);
      const sc = far ? 0.7 : 1;
      ctx.drawImage(img, Math.round(x - 6 * sc), Math.round(y - 50 * sc), Math.round(img.width * sc), Math.round(img.height * sc));
    }
    ctx.globalAlpha = 1;
  }

  // Fault alarm: red wash and a rotating beacon beam from the tower top.
  function alarmFx(t, s) {
    if (s.active === null || s.repair) return;
    ctx.fillStyle = `rgba(255, 30, 30, ${0.08 + 0.06 * Math.sin(t * 8)})`;
    ctx.fillRect(0, 0, W, H);
    const a = t * 4;
    ctx.fillStyle = 'rgba(255, 60, 60, 0.12)';
    ctx.beginPath();
    ctx.moveTo(258, 20);
    ctx.lineTo(258 + Math.cos(a - 0.15) * 400, 20 + Math.abs(Math.sin(a - 0.15)) * 240);
    ctx.lineTo(258 + Math.cos(a + 0.15) * 400, 20 + Math.abs(Math.sin(a + 0.15)) * 240);
    ctx.closePath(); ctx.fill();
  }

  function tower(t, s, armOut) {
    const x0 = 244, x1 = 270, top = 68;
    const red = '#a8383a', redLo = '#5a1c2c', redHi = '#d0584a';
    ctx.drawImage(sprite('tower', W, H, towerFrame), 0, 0);
    // Lightning-mast beacon: blinks, fast during an alarm.
    const alarm = s.active !== null;
    const beaconOn = alarm ? Math.floor(t * 6) % 2 === 0 : Math.floor(t * 1.2) % 2 === 0;
    px(255, 18, 6, 6, beaconOn ? '#ff4a4a' : '#4a1c1c');
    if (beaconOn) disc(258, 21, 6, 'rgba(255, 74, 74, 0.5)', true);
    // Crew access arm with a lit white room, and a lower vent arm with hoses. Both swing away at liftoff.
    const reach = (RX - 27) - (x1 + 3); // to the left booster
    const len = Math.max(0, reach * armOut);
    if (len > 0) {
      px(x1 + 3, 140, len, 5, '#7a2a34'); px(x1 + 3, 140, len, 1, red);
      px(x1 + 3 + len - 14, 126, 14, 16, '#2a2440'); px(x1 + 3 + len - 14, 126, 14, 1, '#4a4064');
      px(x1 + 3 + len - 10, 130, 6, 4, '#ffcf6b');
      px(x1 + 3, 214, len * 0.9, 3, '#6a2430');
      line(x1 + 3 + len * 0.9, 217, x1 + 3 + len, 226, '#3a3454');
    }
  }
  function towerFrame() {
    const x0 = 244, x1 = 270, top = 68;
    const red = '#a8383a', redLo = '#5a1c2c', redHi = '#d0584a';
    // Legs and decks.
    px(x0, top, 3, BASE - top, red); px(x0, top, 1, BASE - top, redHi);
    px(x1, top, 3, BASE - top, redLo);
    for (let y = top; y < BASE - 4; y += 16) {
      px(x0, y, x1 - x0 + 3, 3, red); px(x0, y, x1 - x0 + 3, 1, redHi);
      line(x0 + 3, y + 3, x1 - 1, y + 15, redLo); line(x1 - 1, y + 3, x0 + 3, y + 15, redLo); // X brace
    }
    // Hammerhead crane with a hanging cable and hook.
    px(228, top - 6, 76, 4, red); px(228, top - 6, 76, 1, redHi);
    line(300, top - 2, 300, 96, '#3a3454'); px(298, 96, 5, 3, '#5a5274');
    line(257, top - 6, 232, top - 2, redLo);
    // Lightning mast.
    px(257, 24, 2, top - 30, '#5c6274');
  }

  // One horizontal slice of a round body, shaded from the sunset side (left) to the shadow side (right).
  function shadedRow(y, cx, w, h, tone) {
    const L = Math.round(cx - w / 2);
    const k = tone || ['#fff6ee', '#efe2e6', '#d6c2d4', '#b096b4', '#7a6080'];
    px(L, y, w, h, k[1]);
    px(L, y, Math.max(1, Math.round(w * 0.12)), h, k[0]);
    px(L + Math.round(w * 0.62), y, Math.round(w * 0.2), h, k[2]);
    px(L + Math.round(w * 0.82), y, Math.round(w * 0.15), h, k[3]);
    px(L + w - 1, y, 1, h, k[4]);
    px(L, y, 1, h, '#ffcf9a'); // warm rim light from the sun
  }

  function rocket(y) {
    ctx.drawImage(sprite('rocket', W, H, () => rocketShape(0)), 0, Math.round(y));
  }
  // The same rocket as in Mission 2 (src/launch-render.js), drawn bigger: abort tower, capsule fairing,
  // white upper stage, orange core stage between two white side boosters, four core engines.
  // Heights match the repair zones below (cabin 72-108, avionics 108-186, fuel 194-262, engines 262-292).
  function rocketShape(y) {
    const ORANGE = ['#ffd08a', '#f09a3a', '#d8802c', '#b05e1e', '#7a3a10'];
    const WHITE = ['#ffffff', '#eceef4', '#cfd3de', '#a8aebc', '#7a8090'];
    // Launch abort tower: spire, red tip, abort motor with small nozzles.
    px(RX - 1, y + 46, 2, 26, '#c8ccd6'); px(RX, y + 46, 1, 26, '#eef0f6');
    px(RX - 1, y + 44, 2, 3, '#ff6a4a');
    px(RX - 3, y + 54, 6, 9, '#e6e8ee'); px(RX + 1, y + 54, 2, 9, '#a8aebc');
    for (const nx of [RX - 4, RX + 3]) px(nx, y + 62, 1, 2, '#5a5f6c');
    // Capsule fairing (ogive) with two windows; heat shield and service module below it.
    for (let yy = 70; yy < 104; yy++) shadedRow(y + yy, RX, Math.round(4 + (yy - 70) * 0.53) | 1, 1, WHITE);
    for (const wx of [RX - 6, RX + 2]) { px(wx, y + 88, 4, 3, '#2a2440'); px(wx, y + 88, 1, 1, '#9ad6ff'); }
    px(RX - 11, y + 104, 22, 2, '#5a4030');
    shadedRow(y + 106, RX, 22, 6, WHITE); px(RX - 11, y + 108, 22, 1, '#b08020');
    // Upper stage (white) with seams and the mission name.
    shadedRow(y + 112, RX, 20, 38, WHITE);
    for (const sy of [124, 140]) px(RX - 10, y + sy, 20, 1, '#cfd3de');
    if (typeof PixelText !== 'undefined') ['F', 'M', '-', '1'].forEach((ch, k) => PixelText.draw(ctx, ch, RX - 2, y + 114 + k * 9, '#3a3f4c'));
    // Adapter: widens from the upper stage to the core.
    for (let yy = 150; yy < 158; yy++) shadedRow(y + yy, RX, 20 + Math.round((yy - 150) * 0.75) * 2, 1, WHITE);
    px(RX - 13, y + 157, 26, 1, '#5a5f6c');
    // Core stage: orange foam insulation with a darker intertank band and speckle.
    shadedRow(y + 158, RX, 26, 118, ORANGE);
    px(RX - 13, y + 188, 26, 8, '#b8662a'); for (let x = RX - 12; x < RX + 13; x += 3) px(x, y + 189, 1, 6, '#94501e');
    px(RX - 13, y + 236, 26, 1, '#94501e');
    for (let k = 0; k < 60; k++) px(RX - 12 + ((k * 37) % 24), y + 160 + ((k * 53) % 112), 1, 1, k % 2 ? '#ffc070' : '#c46a22');
    // Side boosters: nose cones, white bodies with dark attach rings, flared skirts and big nozzles.
    for (const bx of [RX - 21, RX + 21]) {
      for (let yy = 144; yy < 162; yy++) shadedRow(y + yy, bx, Math.max(1, Math.round((yy - 144) * 0.7)) | 1, 1, WHITE);
      shadedRow(y + 162, bx, 12, 106, WHITE);
      for (const ry of [172, 214, 252]) { px(bx - 6, y + ry, 12, 2, '#3a3f4c'); px(bx - 6, y + ry, 12, 1, '#5a5f6c'); }
      for (let yy = 268; yy < 280; yy++) shadedRow(y + yy, bx, 12 + Math.floor((yy - 268) / 3) * 2, 1, WHITE);
      for (let k = 0; k < 12; k++) { const w = 8 + Math.floor(k / 2); px(bx - w / 2, y + 280 + k, w, 1, '#4a4a56'); px(bx - w / 2, y + 280 + k, 1, 1, '#7a7a88'); }
      px(bx - 7, y + 291, 14, 1, '#1a1626');
    }
    // Core engine section and four engines between the boosters.
    px(RX - 13, y + 276, 26, 4, '#5a5a66'); px(RX - 13, y + 276, 26, 1, '#7a7a88');
    for (const nx of [RX - 9, RX - 3, RX + 3, RX + 9]) {
      for (let k = 0; k < 11; k++) { const w = 3 + Math.floor(k / 4); px(nx - w / 2, y + 280 + k, w, 1, '#5e5870'); }
      px(nx - 2, y + 290, 5, 1, '#1a1626');
    }
  }

  function puffs(t, x, y, n, color, rise, spread) {
    for (let i = 0; i < n; i++) {
      const a = (t * 0.6 + i / n) % 1;
      const r = Math.round(3 + a * 8);
      ctx.globalAlpha = 0.6 * (1 - a);
      disc(x + Math.sin(i * 3.1) * spread * a, y - a * rise, r, color);
    }
    ctx.globalAlpha = 1;
  }

  function failureFx(t, s, y) {
    // Cryogenic boil-off: real rockets vent vapour while fuelled.
    puffs(t, RX + 20, y + 124, 4, '#e6ecf5', 28, 20);
    const zone = s.active && FAILURES_REF[s.active] ? FAILURES_REF[s.active].zone : null;
    if (zone === 'fuel') puffs(t * 1.6, RX - 12, y + 250, 6, '#ffc85a', -20, 12);
    if (zone === 'engine' && Math.floor(t * 8) % 3 === 0) {
      for (let k = 0; k < 6; k++) px(RX - 14 + ((t * 37 + k * 13) % 28), y + 294 + ((k * 5 + t * 40) % 10), 2, 2, k % 2 ? '#ffe08a' : '#ff9a4a');
    }
    if (zone === 'cooling') { ctx.fillStyle = `rgba(255,80,40,${0.18 + 0.1 * Math.sin(t * 6)})`; ctx.fillRect(RX - 20, y + 256, 40, 36); }
    if (zone === 'antenna' && Math.floor(t * 3) % 2 === 0) { px(250, 60, 16, 3, '#ff4a4a'); disc(258, 30, 8, 'rgba(255,74,74,0.6)', true); }
    if (zone === 'avionics' && Math.floor(t * 10) % 3 === 0) for (let k = 0; k < 4; k++) px(RX - 16 + ((t * 53 + k * 11) % 32), y + 120 + ((k * 17 + t * 30) % 60), 2, 2, '#9ad6ff');
    if (zone === 'cabin') px(RX + 9, y + 92, 5, 5, Math.floor(t * 4) % 2 ? '#ffb547' : '#3a2a12');
  }

  // System check: the part of the rocket that belongs to the checked system gets an X-ray style scan.
  // Rocket pixels are drawn to an offscreen layer so the scan tints only the rocket, never the sky.
  const ZONES = {
    fuel: [194, 262, 'FUEL TANK'],
    engine: [262, 292, 'ENGINES'],
    cabin: [72, 108, 'CREW CABIN'],
    antenna: [46, 108, 'ANTENNA'],
    avionics: [108, 186, 'AVIONICS'],
    cooling: [236, 292, 'COOLING'],
  };
  let layer = null;
  function rocketScanned(t, s, y) {
    if (!layer) { layer = document.createElement('canvas'); layer.width = W; layer.height = H; }
    const main = ctx;
    ctx = layer.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    rocket(y);
    const f = FAILURES_REF[s.checkingId];
    const [z0, z1, label] = (f && ZONES[f.zone]) || [72, 292, 'ROCKET'];
    const top = y + z0, bot = y + z1;
    const line = Math.round(top + ((t * 0.9) % 1) * (bot - top));
    ctx.globalCompositeOperation = 'source-atop'; // paint only where the rocket already is
    px(RX - 40, top, 80, bot - top, 'rgba(111, 227, 255, 0.14)');
    for (let yy = top; yy < line - 10; yy += 3) px(RX - 40, yy, 80, 1, 'rgba(111, 227, 255, 0.35)');
    px(RX - 40, line - 10, 80, 10, 'rgba(111, 227, 255, 0.4)');
    px(RX - 40, line, 80, 2, '#c8f8ff');
    ctx.globalCompositeOperation = 'source-over';
    ctx = main;
    ctx.drawImage(layer, 0, 0);
    // HUD around the target: corner brackets, a marker riding the scan line, and a label with progress.
    const c = '#6fe3ff', x0 = RX - 32, x1 = RX + 31;
    for (const [cx, cy, dx, dy] of [[x0, top, 1, 1], [x1, top, -1, 1], [x0, bot, 1, -1], [x1, bot, -1, -1]]) {
      px(cx, cy, 6 * dx || 1, 1, c); px(cx, cy, 1, 6 * dy || 1, c);
    }
    px(x0 - 6, line, 5, 2, c); px(x1 + 2, line, 5, 2, c);
    if (typeof PixelText !== 'undefined') {
      const pct = Math.round(Math.min(1, Math.max(0, 1 - s.checking / s.cfg.checkTime)) * 100);
      px(x1 + 8, top - 1, 70, 20, 'rgba(10, 4, 20, 0.7)');
      PixelText.draw(ctx, label, x1 + 11, top + 2, c);
      PixelText.draw(ctx, `SCAN ${pct}%`, x1 + 11, top + 11, '#c8f8ff');
    }
  }

  function flame(t, y, power) {
    // Hot glow around the nozzles.
    ctx.globalAlpha = 0.5;
    disc(RX, y + BASE + 6, Math.round(26 + 6 * Math.sin(t * 30)), '#ffb547', true);
    ctx.globalAlpha = 1;
    // Outer layer first, hotter cores on top; each layer tapers to a point.
    const layers = [['#ff5a24', 30, 84], ['#ffb547', 22, 64], ['#ffe9a8', 14, 42], ['#ffffff', 8, 22]];
    // Two booster flames (big and bright) and the core engines' flame between them.
    for (const [fx, size] of [[RX - 21, 0.75], [RX + 21, 0.75], [RX, 0.55]]) layers.forEach(([c, w, l], i) => {
      const len = l * power * size * 1.3 * (0.85 + 0.15 * Math.sin(t * 40 + i * 2 + fx));
      for (let r = 0; r < len; r += 2) {
        const ww = Math.max(1, w * size * Math.sqrt(1 - r / len));
        px(fx - ww / 2, y + BASE + r, ww, 2, c);
      }
    });
    // Shock diamonds: bright beads in a supersonic exhaust once at full thrust.
    if (power > 1.2) for (let k = 0; k < 3; k++) {
      const dy = y + BASE + 18 + k * 18;
      for (let r = 0; r < 6; r++) px(RX - (3 - Math.abs(r - 3)), dy + r, (3 - Math.abs(r - 3)) * 2 + 1, 1, '#ffffff');
    }
  }

  // Billowing exhaust cloud on the pad: dithered puffs with a darker underside.
  function smoke(lt) {
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = Math.min(1, lt / 4) * (0.5 + 0.5 * ((i * 0.37) % 1));
      const dir = i % 2 ? 1 : -1;
      const x = RX + dir * (20 + a * (80 + (i * 26) % 120));
      const r = Math.round(10 + a * 30);
      const yy = 296 - (i % 3) * 8;
      ctx.globalAlpha = 0.85 - 0.35 * a;
      disc(x, yy, r, '#d8d0dc');
      disc(x + 2, yy + Math.round(r * 0.3), Math.round(r * 0.75), '#a89cb4');
      disc(x - Math.round(r * 0.3), yy - Math.round(r * 0.3), Math.round(r * 0.4), '#f0eaf2');
    }
    ctx.globalAlpha = 1;
  }

  // Exhaust trail: a thick column from the rocket all the way down to the pad. Older smoke (further down)
  // is wider and fainter and drifts with the wind.
  function trail(t, y, cam, wind) {
    const from = y + BASE + 70, to = BASE + 10;
    for (let wy = from, k = 0; wy < to; wy += 10, k++) {
      if (wy + cam < -40 || wy + cam > H + 40) continue; // off screen
      const d = wy - from;
      const r = Math.round(Math.min(36, 9 + d * 0.05) + Math.sin(t * 2 + k) * 2);
      const x = RX + Math.sin(k * 1.3) * 3 + d * 0.015 * (wind || 2);
      ctx.globalAlpha = Math.max(0.15, 0.75 - d / 900);
      disc(x + 3, wy + 3, r, '#9a90ac');
      disc(x, wy, r - 1, '#d8d2e2');
      disc(x - Math.round(r * 0.35), wy - Math.round(r * 0.35), Math.max(2, Math.round(r * 0.4)), '#f2eef6');
    }
    ctx.globalAlpha = 1;
  }

  // Status lamps on the tower, one per system, with a dithered glow when lit.
  function towerLamps(t, s) {
    const colors = { unknown: '#5c6374', verify: '#e8d24a', ok: '#4fd17a', fail: '#ff4a4a', repair: '#ffb547' };
    Object.keys(s.systems).forEach((id, i) => { // one lamp per system in this level
      const st = lampState(id, s);
      if (st === 'off') return;
      const x = 230, y = 96 + i * 22;
      const dim = st === 'fail' && Math.floor(t * 4) % 2 === 0;
      const c = dim ? '#5a1a1a' : colors[st];
      if (!dim && st !== 'unknown') disc(x + 4, y + 4, 9, c, true);
      px(x - 2, y - 2, 12, 12, '#12081f');
      px(x, y, 8, 8, c);
      px(x + 1, y + 1, 3, 2, 'rgba(255,255,255,0.55)');
      px(x + 8, y + 3, 6, 2, '#3a3454'); // bracket to the tower
    });
  }

  // 32x32 pixel icons for the supply cards.
  const ICONS = {
    sealant(p) { // squeeze tube with a cap and nozzle
      p(4, 10, 20, 12, '#c9d1e6'); p(4, 10, 20, 3, '#eef2fa'); p(4, 20, 20, 2, '#8a93ab');
      p(1, 9, 4, 14, '#8a93ab'); p(1, 9, 4, 2, '#b8c0d4'); for (let y = 11; y < 22; y += 3) p(1, y, 4, 1, '#6a7390');
      p(9, 12, 10, 8, '#ff9a3d'); p(9, 12, 10, 2, '#ffc27a'); p(11, 15, 6, 2, '#b8501a');
      p(24, 12, 3, 8, '#5c6374'); p(27, 14, 3, 4, '#3a4054'); p(30, 15, 1, 2, '#ffcf6b');
    },
    diagnostic_module(p) { // circuit board with a chip, traces and an LED
      p(3, 5, 26, 22, '#2f7a4a'); p(3, 5, 26, 2, '#4fd17a'); p(3, 25, 26, 2, '#1f5a34');
      for (let i = 0; i < 6; i++) { p(10 + i * 2, 8, 1, 3, '#e8d24a'); p(10 + i * 2, 21, 1, 3, '#e8d24a'); }
      p(9, 11, 14, 10, '#1b1f2a'); p(9, 11, 14, 1, '#3a3f4c'); p(11, 13, 2, 2, '#ff4a4a');
      p(5, 9, 1, 14, '#9fe0b4'); p(5, 22, 4, 1, '#9fe0b4'); p(25, 10, 1, 12, '#9fe0b4');
      p(24, 23, 3, 2, '#e8d24a'); p(6, 6, 2, 2, '#c0c4cc'); p(24, 6, 2, 2, '#c0c4cc');
    },
    replacement_valve(p) { // red hand wheel on a pipe with a flange
      p(0, 21, 32, 6, '#6b7894'); p(0, 21, 32, 2, '#a3aec6'); p(0, 26, 32, 1, '#3d4660');
      p(11, 19, 10, 10, '#525d7c'); p(11, 19, 10, 2, '#7a85a0'); p(14, 13, 4, 7, '#525d7c');
      p(8, 3, 16, 3, '#d64545'); p(8, 11, 16, 3, '#a33030'); p(5, 6, 3, 5, '#d64545'); p(24, 6, 3, 5, '#a33030');
      p(15, 4, 2, 9, '#a33030'); p(9, 7, 14, 2, '#a33030'); p(14, 6, 4, 4, '#ff7a6a'); p(9, 3, 5, 1, '#ff9a8a');
    },
    antenna_relay(p) { // dish on a mast with a feed horn and a signal light
      p(14, 16, 4, 13, '#8a93ab'); p(14, 16, 1, 13, '#b8c0d4'); p(8, 28, 16, 3, '#5c6374'); p(8, 28, 16, 1, '#8a93ab');
      p(3, 5, 3, 7, '#c9d1e6'); p(6, 9, 4, 5, '#c9d1e6'); p(10, 12, 12, 4, '#c9d1e6'); p(22, 9, 4, 5, '#a3aec6'); p(26, 5, 3, 7, '#8a93ab');
      p(6, 10, 4, 1, '#eef2fa'); p(15, 4, 2, 9, '#e8d24a'); p(14, 2, 4, 3, '#ff4a4a'); p(15, 2, 1, 1, '#ffb0a0');
    },
    coolant(p) { // blue canister with a valve cap and a snowflake label
      p(10, 2, 12, 3, '#8a93ab'); p(12, 0, 8, 2, '#5c6374'); p(8, 5, 16, 3, '#5c6374');
      p(6, 8, 20, 22, '#3a7bd5'); p(6, 8, 4, 22, '#6aa6f0'); p(22, 8, 4, 22, '#2a5aa0'); p(6, 29, 20, 1, '#1e4a8a');
      p(10, 12, 12, 12, '#e8f2ff'); p(15, 13, 2, 10, '#3a7bd5'); p(11, 17, 10, 2, '#3a7bd5');
      p(12, 14, 2, 2, '#3a7bd5'); p(18, 14, 2, 2, '#3a7bd5'); p(12, 20, 2, 2, '#3a7bd5'); p(18, 20, 2, 2, '#3a7bd5');
    },
  };
  Object.assign(ICONS, {
    torque_wrench(p) { // wrench with an open jaw and a dial
      p(4, 22, 18, 5, '#a3aec6'); p(4, 22, 18, 1, '#eef2fa'); p(4, 26, 18, 1, '#5c6374');
      p(20, 14, 8, 14, '#8a93ab'); p(22, 16, 4, 6, '#1e1236'); p(20, 14, 8, 1, '#c9d1e6');
      p(2, 18, 8, 12, '#ff9a3d'); p(2, 18, 8, 2, '#ffc27a'); p(4, 22, 4, 4, '#3a1205'); p(5, 23, 2, 1, '#ffe2a0');
    },
    plumbing_kit(p) { // plunger: red cup on a wooden handle
      p(14, 2, 4, 18, '#c08a4a'); p(14, 2, 1, 18, '#e0aa6a'); p(13, 1, 6, 2, '#8a5a2a');
      p(7, 20, 18, 4, '#d64545'); p(5, 24, 22, 5, '#d64545'); p(5, 24, 22, 1, '#ff7a6a'); p(5, 28, 22, 1, '#a33030');
      p(9, 21, 4, 2, '#ff9a8a');
    },
    pressure_regulator(p) { // round gauge on a valve body
      p(6, 20, 20, 9, '#6b7894'); p(6, 20, 20, 2, '#a3aec6'); p(0, 23, 6, 4, '#525d7c'); p(26, 23, 6, 4, '#525d7c');
      p(9, 3, 14, 14, '#2a2f3c'); p(10, 4, 12, 12, '#e9e3cf'); p(15, 16, 2, 4, '#525d7c');
      p(15, 6, 1, 4, '#c23a3a'); p(16, 9, 3, 1, '#c23a3a'); p(11, 9, 1, 1, '#3d4660'); p(20, 9, 1, 1, '#3d4660'); p(15, 5, 1, 1, '#3d4660');
    },
    wire_kit(p) { // coiled red and yellow wires with copper ends
      p(4, 6, 24, 4, '#ff4d6a'); p(4, 6, 24, 1, '#ff9aaa'); p(26, 6, 4, 2, '#e8a050');
      p(4, 14, 24, 4, '#ffd34d'); p(4, 14, 24, 1, '#fff0a0'); p(0, 14, 4, 2, '#e8a050');
      p(4, 22, 24, 4, '#4dffc3'); p(4, 22, 24, 1, '#b0ffe8'); p(26, 22, 4, 2, '#e8a050');
      p(2, 8, 3, 8, '#ff4d6a'); p(27, 16, 3, 8, '#ffd34d');
    },
    pump_parts(p) { // piston and spring
      p(10, 2, 12, 6, '#a3aec6'); p(10, 2, 12, 2, '#eef2fa'); p(14, 8, 4, 10, '#6b7894');
      for (let y = 18; y < 30; y += 3) { p(9, y, 14, 2, '#c9d1e6'); p(9, y + 2, 14, 1, '#5c6374'); }
    },
    fuel_filter(p) { // cylinder filter with pleats and end caps
      p(6, 4, 20, 4, '#5c6374'); p(6, 26, 20, 4, '#5c6374'); p(6, 4, 20, 1, '#8a93ab');
      p(8, 8, 16, 18, '#ffcf6b'); for (let x = 9; x < 24; x += 3) p(x, 8, 1, 18, '#c8962a');
      p(14, 0, 4, 4, '#8a93ab'); p(14, 30, 4, 2, '#8a93ab');
    },
    fuse_pack(p) { // two glass fuses with metal caps
      for (const [y, c] of [[5, '#ffd34d'], [18, '#ff9a3d']]) {
        p(4, y, 6, 9, '#c9d1e6'); p(22, y, 6, 9, '#c9d1e6'); p(4, y, 6, 2, '#eef2fa');
        p(10, y + 1, 12, 7, 'rgba(180, 220, 255, 0.45)'); p(10, y + 4, 12, 1, c); p(10, y + 1, 12, 1, '#eef2fa');
      }
    },
  });

  function icon(context, id) {
    context.clearRect(0, 0, 32, 32);
    const p = (x, y, w, h, c) => { context.fillStyle = c; context.fillRect(x, y, w, h); };
    if (ICONS[id]) ICONS[id](p);
  }

  // 48x48 flight controller in front of console screens. Mouth moves while talking; red tint during an alarm.
  function portrait(context, t, talking, alarm) {
    const p = (x, y, w, h, c) => { context.fillStyle = c; context.fillRect(x, y, w, h); };
    const red = alarm && Math.floor(t * 4) % 2;
    p(0, 0, 48, 48, red ? '#4a1230' : '#1e1236');
    // Shoulders, shirt, collar and a round mission patch.
    p(8, 38, 32, 10, '#2c4a7a'); p(8, 38, 32, 2, '#3a5c90'); p(6, 42, 4, 6, '#24406a'); p(38, 42, 4, 6, '#1e3658');
    p(19, 37, 10, 4, '#e8e2cf'); p(21, 39, 6, 3, '#c9c1ae');
    p(31, 41, 5, 5, '#ff9a3d'); p(32, 42, 3, 3, '#ffe2a0');
    // Neck and face with soft shading.
    p(20, 32, 8, 6, '#c99a72');
    p(14, 11, 20, 22, '#e0b48a'); p(14, 11, 3, 22, '#ecc49c'); p(30, 11, 4, 22, '#c99a72'); p(16, 31, 16, 2, '#c99a72');
    p(12, 18, 2, 6, '#d4a67e'); p(34, 18, 2, 6, '#c08e66'); // ears
    // Hair with a highlight.
    p(13, 6, 22, 7, '#4a3424'); p(12, 9, 3, 10, '#4a3424'); p(33, 9, 3, 8, '#3a2618'); p(17, 7, 9, 2, '#6a4a32');
    // Eyebrows, eyes (with blink), nose, mouth (moves while talking).
    p(17, 16, 5, 1, '#3a2618'); p(26, 16, 5, 1, '#3a2618');
    const blink = Math.floor(t * 10) % 37 === 0;
    if (blink) { p(17, 20, 5, 1, '#3a2618'); p(26, 20, 5, 1, '#3a2618'); } else {
      p(17, 19, 5, 3, '#f4f0ea'); p(26, 19, 5, 3, '#f4f0ea'); p(19, 19, 2, 3, '#2a2440'); p(28, 19, 2, 3, '#2a2440');
    }
    p(23, 22, 2, 5, '#c99a72'); p(22, 26, 4, 1, '#b8885e');
    const open = talking && Math.floor(t * 12) % 2 === 0;
    p(20, 28, 8, open ? 3 : 1, '#7a3a2a'); if (open) p(21, 28, 6, 1, '#f4f0ea');
    // Headset: band, ear cups and a mic boom with a status light.
    p(12, 4, 24, 2, '#2a2f3c'); p(10, 6, 3, 4, '#2a2f3c'); p(35, 6, 3, 4, '#2a2f3c');
    p(9, 16, 5, 9, '#2a2f3c'); p(9, 17, 2, 6, '#3e4456'); p(34, 16, 5, 9, '#2a2f3c');
    p(35, 25, 2, 4, '#2a2f3c'); p(28, 28, 8, 2, '#2a2f3c'); p(26, 27, 3, 4, '#3e4456');
  }

  let FAILURES_REF = {};

  // liftoff: seconds since ignition, or -1 when not launching. Liftoff itself starts 2 s after ignition.
  // env: { hour, kind, wind } for time of day and weather. Default: a calm dusk, the launch hour.
  function draw(context, s, t, failures, liftoff, env = DUSK) {
    ctx = context;
    ctx.imageSmoothingEnabled = false;
    FAILURES_REF = failures;
    const rise = liftoff > 2 ? 12 * (liftoff - 2) * (liftoff - 2) : 0;
    const y = -rise;
    // Camera follows the rocket (keeping it whole on screen) until FOLLOW_END, then holds still so the
    // rocket climbs out of the top of the frame, leaving its trail behind.
    const FOLLOW_END = 6.5;
    const follow = (lt) => (lt > 2 ? 12 * (lt - 2) * (lt - 2) : 0);
    const cam = Math.max(0, Math.min(rise, follow(FOLLOW_END)) - 30);
    ctx.save();
    const shakeAmp = liftoff >= 0 ? Math.max(0, 6 - liftoff * 0.8) : 0;
    ctx.translate(Math.round(Math.sin(t * 60) * shakeAmp), Math.round(Math.cos(t * 47) * shakeAmp * 0.5));
    // Far backdrop (sky, sun, shore) moves at half the camera speed for depth; above it, the sky
    // deepens to night as the rocket climbs.
    const far = Math.round(cam * 0.5);
    ctx.save();
    ctx.translate(0, far);
    sky(t, env);
    ctx.restore();
    if (far > 0) space(t, far);
    ctx.save();
    ctx.translate(0, Math.round(cam * 0.6));
    clouds(t, env, 0);
    if (liftoff < 0) clouds(t, env, 1); // on the ground the near clouds stay behind the rocket
    ctx.restore();
    ctx.save();
    ctx.translate(0, Math.round(cam));
    blendLayers('shore', palettesAt(env.hour));
    water(t, env);
    ground(env);
    floodlights(t);
    tower(t, s, liftoff >= 0 ? Math.max(0, 1 - liftoff / 1.5) : 1);
    towerLamps(t, s);
    windsock(t, env);
    if (liftoff >= 0) {
      smoke(liftoff);
      if (liftoff > 2) trail(t, y, cam, env.wind);
      flame(t, y, Math.min(1, liftoff / 1.5) + (liftoff > 2 ? Math.min(1, 0.6 + (liftoff - 2) * 0.1) : 0));
    }
    if (liftoff < 0 && s.checking > 0) rocketScanned(t, s, y);
    else rocket(y);
    if (liftoff < 0) failureFx(t, s, y);
    ctx.restore();
    // Near cloud layer in front of the pad, moving with the camera a little faster than the far layer.
    if (liftoff >= 0) { // in flight, near clouds sweep down past the rocket, faster than the camera
      ctx.save();
      ctx.translate(0, Math.round(cam * 1.4));
      clouds(t, env, 1, true);
      ctx.restore();
    }
    // Engine glow lights the whole scene at ignition.
    if (liftoff >= 0) {
      ctx.fillStyle = `rgba(255, 170, 80, ${Math.max(0, 0.25 - Math.max(0, liftoff - 3) * 0.04)})`;
      ctx.fillRect(0, 0, W, H);
    }
    precipitation(t, env);
    const night = nightness(palettesAt(env.hour));
    if (night > 0) { ctx.fillStyle = `rgba(4, 2, 20, ${0.45 * night})`; ctx.fillRect(0, 0, W, H); } // the world darkens at night
    alarmFx(t, s);
    ctx.restore();
  }

  // 16x16 weather icons for the forecast cards.
  function weatherIcon(context, kind) {
    const p = (x, y, w, h, c) => { context.fillStyle = c; context.fillRect(x, y, w, h); };
    context.clearRect(0, 0, 16, 16);
    const cloud = (y, c) => { p(3, y + 2, 10, 4, c); p(5, y, 4, 2, c); p(9, y + 1, 3, 1, c); p(2, y + 3, 1, 2, c); p(13, y + 3, 1, 2, c); };
    if (kind === 'sun' || kind === 'cold') {
      p(5, 5, 6, 6, kind === 'cold' ? '#c8e4ff' : '#ffd34d'); p(6, 4, 4, 8, kind === 'cold' ? '#c8e4ff' : '#ffd34d'); p(4, 6, 8, 4, kind === 'cold' ? '#c8e4ff' : '#ffd34d');
      for (const [x, y] of [[7, 0], [7, 14], [0, 7], [14, 7], [2, 2], [12, 2], [2, 12], [12, 12]]) p(x, y, 2, 2, kind === 'cold' ? '#8ac0ff' : '#ff9a3d');
    } else if (kind === 'cloud') { p(9, 2, 5, 5, '#ffd34d'); cloud(5, '#e6ecf6'); p(3, 10, 10, 1, '#a8b0c8'); }
    else if (kind === 'wind') { for (const [y, w] of [[4, 11], [8, 14], [12, 9]]) { p(1, y, w, 2, '#c8e4ff'); p(w, y - 2, 2, 2, '#c8e4ff'); } }
    else {
      cloud(1, kind === 'storm' ? '#6a6480' : '#a8b0c8');
      for (const x of [4, 8, 12]) p(x, 10, 1, 3, '#6fe3ff');
      if (kind === 'storm') { p(8, 8, 2, 3, '#ffd34d'); p(6, 11, 3, 2, '#ffd34d'); p(6, 13, 2, 3, '#ffd34d'); }
    }
  }

  const DUSK = { hour: 18.5, kind: 'sun', wind: 3 };

  return { draw, lampState, icon, portrait, weatherIcon, palettesAt, sunAt, W, H };
})();

if (typeof module !== 'undefined') module.exports = Render;
