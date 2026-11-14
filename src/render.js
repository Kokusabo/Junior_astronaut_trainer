// Launch pad scene, drawn from code shapes on a 640x360 canvas (scaled with pixelated CSS).
// Reads game state, never changes it. lampState is pure so Node can test it.
const Render = (function () {
  const W = 640, H = 360;
  const RX = 340, BASE = 292; // rocket centre x and engine base y
  const HZ = 264;             // horizon line

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
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => {
    const A = hex(a), B = hex(b);
    return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
  };

  // ---------- Static backdrop: sky, sun, far shore. Baked once, it never changes. ----------
  const SKY = ['#140828', '#1c0b36', '#260e44', '#331250', '#45175a', '#5c1d62', '#782566', '#963066', '#b53e62', '#d4505a', '#ee6a50', '#ff8a4a'];
  let backdrop = null;
  function bake() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const saved = ctx;
    ctx = c.getContext('2d');
    // 22 bands interpolated from the palette, with a 2-row checker dither on every seam.
    const bands = 22, bandH = HZ / bands;
    const colorAt = (i) => { const f = (i / (bands - 1)) * (SKY.length - 1); const k = Math.min(SKY.length - 2, Math.floor(f)); return mix(SKY[k], SKY[k + 1], f - k); };
    for (let i = 0; i < bands; i++) px(0, i * bandH, W, bandH + 1, colorAt(i));
    for (let i = 1; i < bands; i++) {
      const y = Math.round(i * bandH);
      ctx.fillStyle = colorAt(i);
      for (let x = 0; x < W; x += 2) ctx.fillRect(x + (i & 1), y - 2, 1, 1);
      ctx.fillStyle = colorAt(i - 1);
      for (let x = 0; x < W; x += 2) ctx.fillRect(x + ((i + 1) & 1), y + 1, 1, 1);
    }
    // Setting sun: dithered halo, solid glow, disc, and the classic sliced lower half.
    disc(128, HZ, 62, '#ff9a5a', true);
    disc(128, HZ, 44, '#ffa868');
    disc(128, HZ, 30, '#ffe2a0');
    px(108, HZ - 26, 18, 2, '#fff4d0');
    for (let k = 0; k < 5; k++) px(96, HZ - 14 + k * 5, 64, 1 + Math.floor(k / 2), '#ffa868');
    // Far shore: tree line, palms, range buildings, assembly building, water tower.
    const shore = '#2a0f35';
    px(0, HZ - 10, W, 12, shore);
    for (let x = 0; x < W; x += 4) px(x, HZ - 14 + Math.floor(rnd() * 5), 4, 6, shore);
    const building = (x, w, h, lit) => {
      px(x, HZ - h, w, h, '#331240'); px(x, HZ - h, 2, h, '#3e1a4c');
      for (let k = 0; k < lit; k++) px(x + 4 + Math.floor(rnd() * (w - 8)), HZ - h + 4 + Math.floor(rnd() * (h - 10)), 2, 2, '#ffcf6b');
    };
    building(380, 26, 22, 3); building(410, 16, 30, 2); building(560, 30, 18, 3);
    // Big assembly building: tall box with a lighter sunlit face, vertical door slot and a few lit windows.
    px(470, 188, 76, 76, '#36153f'); px(470, 188, 10, 76, '#43204c'); px(470, 188, 76, 3, '#4a2454');
    px(500, 200, 14, 64, '#2a0f35'); for (let y = 204; y < 260; y += 6) px(501, y, 12, 1, '#36153f');
    for (let k = 0; k < 7; k++) px(484 + Math.floor(rnd() * 56), 196 + Math.floor(rnd() * 56), 2, 2, '#ffcf6b');
    px(596, 214, 6, 50, '#331240'); px(588, 206, 22, 10, '#331240'); px(588, 206, 22, 2, '#43204c'); // water tower
    const palm = (x, h) => {
      for (let k = 0; k < h; k++) px(x + Math.round(Math.sin(k / h * 1.6) * 4), HZ - k, 2, 1, shore);
      const tx = x + Math.round(Math.sin(1.6) * 4), ty = HZ - h;
      for (const [dx, dy] of [[-10, 4], [10, 4], [-7, -3], [7, -3], [0, -5]]) line(tx, ty, tx + dx, ty + dy, shore);
    };
    palm(30, 24); palm(52, 30); palm(612, 26);
    ctx = saved;
    return c;
  }

  function sky(t) {
    if (!backdrop) backdrop = bake();
    ctx.drawImage(backdrop, 0, 0);
    for (const st of stars) {
      if (st.y > 120) continue; // only the dark upper sky shows stars at dusk
      if (Math.sin(t * 2 + st.tw * 20) < -0.4) continue;
      if (st.tw > 0.93) { px(st.x - 1, st.y, 3, 1, '#ffffff'); px(st.x, st.y - 1, 1, 3, '#ffffff'); } // bright twinkle
      else px(st.x, st.y, 1, 1, st.tw > 0.6 ? '#ffffff' : '#d8a8e8');
    }
  }

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

  // Sea between the far shore and the pad, with a shimmering sun reflection.
  function water(t) {
    for (let y = HZ + 2; y < 290; y++) px(0, y, W, 1, mix('#7a3a5e', '#2e1640', (y - HZ) / 26));
    const shift = Math.floor(t * 6);
    for (let y = HZ + 4; y < 288; y += 3) {
      for (let x = ((y * 7 + shift) % 24) - 24; x < W; x += 24) px(x, y, 8, 1, 'rgba(255, 170, 160, 0.18)');
      const w = Math.max(4, 60 - (y - HZ) * 1.6 + Math.sin(t * 3 + y) * 6);
      px(128 - w / 2 + Math.sin(t * 2 + y) * 3, y, w, 1, (y + shift) % 2 ? '#ff9a5a' : '#ffc27a');
    }
  }

  function ground() {
    px(0, 290, W, H - 290, '#22132f');
    seed = 11;
    for (let i = 0; i < 260; i++) px(Math.floor(rnd() * W), 292 + Math.floor(rnd() * 68), 2, 1, i % 3 ? '#2c1a3c' : '#1a0d26');
    // Crawler road: gravel strip widening toward the viewer.
    for (let y = 316; y < H; y++) {
      const half = 26 + (y - 316) * 1.4;
      px(RX - half, y, half * 2, 1, '#2f1d3e');
      if (y % 3 === 0) for (let x = RX - half + (y % 6); x < RX + half; x += 7) px(x, y, 1, 1, '#45305a');
    }
    // Pad: top surface, edge highlight, hazard-striped front, flame trench opening.
    px(196, 290, 288, 10, '#6a5a7a'); px(196, 290, 288, 1, '#a48eb0');
    px(196, 300, 288, 18, '#3e3050');
    for (let x = 196; x < 484; x += 8) for (let k = 0; k < 4; k++) px(x + k, 300 + k, 4, 1, '#e8b030');
    px(196, 304, 288, 1, '#2a1f38');
    px(310, 300, 60, 18, '#0e0816'); px(310, 300, 60, 2, '#241a30');
    // Hold-down posts and plumbing on the pad.
    px(RX - 26, 282, 6, 8, '#8a7a96'); px(RX + 20, 282, 6, 8, '#6a5a7a');
    px(222, 280, 4, 10, '#4a3a5a'); px(214, 276, 20, 4, '#5a4a6a');
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

  // Slow clouds made of pixel puffs, lit pink from below by the sun.
  function clouds(t) {
    for (let i = 0; i < 5; i++) {
      const w = 70 + i * 26;
      const x = ((t * (4 + i * 1.5) + i * 173) % (W + w * 2)) - w;
      const y = 50 + i * 26;
      for (let k = 0; k < 4; k++) disc(x + k * (w / 4) + 10, y - (k % 2 ? 6 : 2), 9 + (k % 2) * 4, '#5a2462');
      px(x + 4, y, w, 7, '#5a2462');
      px(x + 8, y + 5, w - 8, 2, '#ff8a7a');
      px(x + 16, y - 10, w / 3, 1, '#7a3a7e');
    }
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
    // Lightning mast and beacon.
    px(257, 24, 2, top - 30, '#5c6274');
    const alarm = s.active !== null;
    const beaconOn = alarm ? Math.floor(t * 6) % 2 === 0 : Math.floor(t * 1.2) % 2 === 0;
    px(255, 18, 6, 6, beaconOn ? '#ff4a4a' : '#4a1c1c');
    if (beaconOn) disc(258, 21, 6, 'rgba(255, 74, 74, 0.5)', true);
    // Crew access arm with a lit white room, and a lower vent arm with hoses. Both swing away at liftoff.
    const reach = (RX - 17) - (x1 + 3);
    const len = Math.max(0, reach * armOut);
    if (len > 0) {
      px(x1 + 3, 140, len, 5, '#7a2a34'); px(x1 + 3, 140, len, 1, red);
      px(x1 + 3 + len - 14, 126, 14, 16, '#2a2440'); px(x1 + 3 + len - 14, 126, 14, 1, '#4a4064');
      px(x1 + 3 + len - 10, 130, 6, 4, '#ffcf6b');
      px(x1 + 3, 214, len * 0.9, 3, '#6a2430');
      line(x1 + 3 + len * 0.9, 217, x1 + 3 + len, 226, '#3a3454');
    }
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
    const L = RX - 17, R = RX + 17;
    // Launch escape tower.
    px(RX - 1, y + 50, 2, 22, '#c8ccd6');
    px(RX - 3, y + 54, 6, 8, '#d8d0dc'); px(RX + 1, y + 54, 2, 8, '#a8a0b4');
    px(RX - 1, y + 46, 2, 4, '#ff6a4a');
    // Crew capsule: cone with two windows and a heat-shield ring.
    for (let yy = 72; yy < 104; yy++) shadedRow(y + yy, RX, Math.round(12 + (yy - 72) * 0.7) | 1, 1);
    for (const wx of [RX - 8, RX + 2]) { px(wx, y + 86, 5, 4, '#2a2440'); px(wx, y + 86, 2, 1, '#9ad6ff'); }
    px(L, y + 104, 34, 4, '#5a4a5a'); px(L, y + 104, 34, 1, '#7a6a7a');
    // Upper stage with panel seams and a stencilled mission name.
    shadedRow(y + 108, RX, 34, 78);
    for (const sy of [130, 158]) px(L + 1, y + sy, 32, 1, '#cbb8cc');
    if (typeof PixelText !== 'undefined') ['F', 'M', '-', '1'].forEach((ch, i) => PixelText.draw(ctx, ch, RX - 3, y + 116 + i * 9, '#3a2c48'));
    // Interstage with ribs.
    px(L, y + 186, 34, 8, '#2a2236'); px(L, y + 186, 34, 1, '#4a3e5c');
    for (let x = L + 2; x < R; x += 4) px(x, y + 187, 1, 7, '#3a3048');
    // First stage with roll-pattern quarters and a seam.
    shadedRow(y + 194, RX, 34, 68);
    shadedRow(y + 200, RX - 8.5, 17, 14, ['#4a3e5c', '#2a2236', '#221c2e', '#1a1624', '#120e1a']);
    shadedRow(y + 214, RX + 8.5, 17, 14, ['#4a3e5c', '#2a2236', '#221c2e', '#1a1624', '#120e1a']);
    px(L + 1, y + 240, 32, 1, '#cbb8cc');
    // Swept fins, sunlit left and shaded right.
    for (let k = 0; k < 36; k++) {
      const w = Math.floor(k * 14 / 36);
      if (w) { px(L - w, y + 236 + k, w, 1, '#d8c6d6'); px(L - w, y + 236 + k, 1, 1, '#ffcf9a'); }
      if (w) { px(R, y + 236 + k, w, 1, '#9a80a0'); px(R + w - 1, y + 236 + k, 1, 1, '#6a5070'); }
    }
    // Engine skirt and three nozzles.
    for (let k = 0; k < 18; k++) px(L - Math.floor(k / 9), y + 262 + k, 34 + Math.floor(k / 9) * 2, 1, k % 4 ? '#4a4458' : '#3a3448');
    px(L - 2, y + 262, 3, 18, '#6a6478');
    for (const nx of [RX - 12, RX, RX + 12]) {
      for (let k = 0; k < 12; k++) {
        const w = 6 + Math.floor(k / 3);
        px(nx - w / 2, y + 280 + k, w, 1, '#5e5870');
        px(nx - w / 2, y + 280 + k, 1, 1, '#8a84a0');
      }
      px(nx - 4, y + 291, 8, 1, '#1a1626');
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
    if (zone === 'fuel') puffs(t * 1.6, RX - 19, y + 250, 6, '#ffc85a', -20, 12);
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
    // Outer layer first, hotter cores on top; each layer tapers to a point.
    const layers = [['#ff5a24', 30, 84], ['#ffb547', 22, 64], ['#ffe9a8', 14, 42], ['#ffffff', 8, 22]];
    layers.forEach(([c, w, l], i) => {
      const len = l * power * (0.85 + 0.15 * Math.sin(t * 40 + i * 2));
      for (let r = 0; r < len; r += 2) {
        const ww = Math.max(1, w * Math.sqrt(1 - r / len));
        px(RX - ww / 2, y + BASE + r, ww, 2, c);
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

  // Smoke column the rocket leaves behind once it climbs.
  function trail(t, y) {
    for (let k = 0; k < 30; k++) {
      const ty = y + BASE + 40 + k * 16;
      if (ty > BASE + 20) break;
      const r = Math.round(8 + k * 0.9 + Math.sin(t * 3 + k) * 2);
      ctx.globalAlpha = Math.max(0.1, 0.6 - k * 0.015);
      disc(RX + Math.sin(k * 1.7) * 3, ty, r, '#d2ccdc');
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
    // Console screens behind, with scrolling data lines.
    for (const [sx, sy] of [[2, 4], [34, 6]]) {
      p(sx, sy, 12, 10, '#0c0a1c'); p(sx + 1, sy + 1, 10, 8, red ? '#5a1a2a' : '#123a4a');
      for (let k = 0; k < 3; k++) p(sx + 2, sy + 2 + ((k * 3 + Math.floor(t * 4)) % 7), 4 + ((k * 5) % 5), 1, red ? '#ff6a7a' : '#6fe3ff');
    }
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
    p(27, 28, 1, 1, alarm ? '#ff4a4a' : '#4fd17a');
  }

  let FAILURES_REF = {};

  // liftoff: seconds since ignition, or -1 when not launching. Liftoff itself starts 2 s after ignition.
  function draw(context, s, t, failures, liftoff) {
    ctx = context;
    FAILURES_REF = failures;
    const rise = liftoff > 2 ? 12 * (liftoff - 2) * (liftoff - 2) : 0;
    const y = -rise;
    // Camera follows the rocket once it clears the tower; the ground drops away below.
    const cam = Math.max(0, rise - 40);
    ctx.save();
    const shakeAmp = liftoff >= 0 ? Math.max(0, 6 - liftoff * 0.8) : 0;
    ctx.translate(Math.round(Math.sin(t * 60) * shakeAmp), Math.round(Math.cos(t * 47) * shakeAmp * 0.5));
    // Far backdrop (sky, sun, shore) moves at half the camera speed for depth; above it, the sky
    // deepens to night as the rocket climbs.
    const far = Math.round(cam * 0.5);
    ctx.save();
    ctx.translate(0, far);
    sky(t);
    ctx.restore();
    if (far > 0) space(t, far);
    ctx.save();
    ctx.translate(0, Math.round(cam * 0.7));
    clouds(t);
    ctx.restore();
    ctx.save();
    ctx.translate(0, Math.round(cam));
    water(t);
    ground();
    floodlights(t);
    tower(t, s, liftoff >= 0 ? Math.max(0, 1 - liftoff / 1.5) : 1);
    towerLamps(t, s);
    if (liftoff >= 0) {
      smoke(liftoff);
      if (liftoff > 2) trail(t, y);
      flame(t, y, Math.min(1, liftoff / 1.5) + (liftoff > 2 ? 0.6 : 0));
    }
    if (liftoff < 0 && s.checking > 0) rocketScanned(t, s, y);
    else rocket(y);
    if (liftoff < 0) failureFx(t, s, y);
    ctx.restore();
    // Engine glow lights the whole scene at ignition.
    if (liftoff >= 0) {
      ctx.fillStyle = `rgba(255, 170, 80, ${Math.max(0, 0.25 - Math.max(0, liftoff - 3) * 0.04)})`;
      ctx.fillRect(0, 0, W, H);
    }
    alarmFx(t, s);
    ctx.restore();
  }

  return { draw, lampState, icon, portrait, W, H };
})();

if (typeof module !== 'undefined') module.exports = Render;
